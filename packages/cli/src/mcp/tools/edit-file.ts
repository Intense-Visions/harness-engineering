import { sanitizePath } from '../utils/sanitize-path.js';

/**
 * `edit_file` — exact-string surgical edit for agents whose native editing is
 * unreliable.
 *
 * Motivation: a local model driven through Codex CLI has no working `apply_patch`
 * (freeform variant is grammar-constrained / GPT-5-only; the function variant is
 * not offered for third-party OSS models in current Codex), so it falls back to
 * shell redirection (`cat >`, `echo >>`, `mv`) that clobbers or deletes files —
 * observed live deleting a barrel `index.ts`. This tool gives such an agent a
 * precise, verifiable edit primitive: replace an EXACT `old_string` with
 * `new_string`, refusing ambiguous or missing matches instead of guessing. It is
 * the same contract as an IDE/Claude-Code `Edit`, and is deliberately boring:
 * no fuzzy matching, no whole-file rewrite, no side effects beyond the one file.
 */
export const editFileDefinition = {
  name: 'edit_file',
  description:
    'Make a surgical, exact-string edit to a single existing file: replace old_string with new_string. Prefer this over shell redirection (cat >, echo >>) or apply_patch, which corrupt files. old_string must appear EXACTLY ONCE (include enough surrounding context to be unique) unless replace_all is true. Fails without writing if old_string is missing or ambiguous, so you can retry with more context. Does not create files.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description:
          'Absolute path (or path relative to the working directory) of the file to edit.',
      },
      old_string: {
        type: 'string',
        description:
          'The exact text to replace, copied verbatim from the file including whitespace and indentation. Must be unique in the file unless replace_all is true.',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text. Must differ from old_string.',
      },
      replace_all: {
        type: 'boolean',
        description:
          'Replace every occurrence of old_string instead of requiring a unique match. Default false.',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },
};

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

export async function handleEditFile(input: {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}) {
  const {
    path: rawPath,
    old_string: oldStr,
    new_string: newStr,
    replace_all: replaceAll = false,
  } = input;

  if (oldStr === newStr) {
    return errorResult('old_string and new_string are identical — no edit to make.');
  }
  if (oldStr === '') {
    return errorResult(
      'old_string is empty — edit_file replaces existing text and cannot create files.'
    );
  }

  let targetPath: string;
  try {
    targetPath = sanitizePath(rawPath);
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }

  const { readFile, writeFile, stat } = await import('fs/promises');

  try {
    const info = await stat(targetPath);
    if (!info.isFile()) {
      return errorResult(`${targetPath} is not a regular file.`);
    }
  } catch {
    return errorResult(
      `file not found: ${targetPath} (edit_file edits existing files; it does not create them).`
    );
  }

  let original: string;
  try {
    original = await readFile(targetPath, 'utf8');
  } catch (error) {
    return errorResult(
      `could not read ${targetPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const occurrences = countOccurrences(original, oldStr);
  if (occurrences === 0) {
    return errorResult(
      `old_string not found in ${targetPath}. Copy the exact text (including indentation) from the current file and try again.`
    );
  }
  if (occurrences > 1 && !replaceAll) {
    return errorResult(
      `old_string appears ${occurrences} times in ${targetPath}; it must be unique. Add surrounding context to disambiguate, or set replace_all: true to replace every occurrence.`
    );
  }

  const updated = replaceAll
    ? original.split(oldStr).join(newStr)
    : original.replace(oldStr, newStr);

  try {
    await writeFile(targetPath, updated, 'utf8');
  } catch (error) {
    return errorResult(
      `could not write ${targetPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const replaced = replaceAll ? occurrences : 1;
  return {
    content: [
      {
        type: 'text' as const,
        text: `Edited ${targetPath} — replaced ${replaced} occurrence${replaced === 1 ? '' : 's'} of old_string.`,
      },
    ],
  };
}
