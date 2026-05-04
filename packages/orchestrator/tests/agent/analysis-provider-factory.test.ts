import { describe, it, expect, vi } from 'vitest';
import type { BackendDef } from '@harness-engineering/types';
import {
  AnthropicAnalysisProvider,
  ClaudeCliAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import { buildAnalysisProvider } from '../../src/agent/analysis-provider-factory.js';

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
};

describe('buildAnalysisProvider — BackendDef → AnalysisProvider translation', () => {
  it('SC31: type=local builds OpenAICompatible with endpoint + resolved model', () => {
    const def: BackendDef = {
      type: 'local',
      endpoint: 'http://localhost:11434/v1',
      model: 'gemma-4-e4b',
      apiKey: 'ollama',
    };
    const result = buildAnalysisProvider({
      def,
      backendName: 'local',
      layer: 'sel',
      getResolvedModel: () => 'gemma-4-e4b',
      getResolverAvailable: () => true,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
  });

  it('SC31: type=pi builds OpenAICompatible (resolver-aware model)', () => {
    const def: BackendDef = {
      type: 'pi',
      endpoint: 'http://pi:1234/v1',
      model: ['a', 'b'],
    };
    const result = buildAnalysisProvider({
      def,
      backendName: 'local',
      layer: 'sel',
      getResolvedModel: () => 'a',
      getResolverAvailable: () => true,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
  });

  it('SC31: type=local with unavailable resolver returns null and warns', () => {
    const warnSpy = vi.fn();
    const def: BackendDef = {
      type: 'local',
      endpoint: 'http://localhost:11434/v1',
      model: 'gemma-4-e4b',
    };
    const result = buildAnalysisProvider({
      def,
      backendName: 'local',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: { ...noopLogger, warn: warnSpy },
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/Intelligence pipeline disabled/i);
  });

  it('SC32: type=anthropic builds AnthropicAnalysisProvider', () => {
    const def: BackendDef = { type: 'anthropic', model: 'claude-3', apiKey: 'k' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'cloud',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(AnthropicAnalysisProvider);
  });

  it('type=anthropic without apiKey falls back to ClaudeCli', () => {
    const def: BackendDef = { type: 'anthropic', model: 'claude-3' };
    // Defensively scrub ANTHROPIC_API_KEY from the test env — vitest may
    // inherit a real key from the user's shell.
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const result = buildAnalysisProvider({
        def,
        backendName: 'cloud',
        layer: 'sel',
        getResolvedModel: () => null,
        getResolverAvailable: () => false,
        intelligence: { enabled: true },
        logger: noopLogger,
      });
      expect(result).toBeInstanceOf(ClaudeCliAnalysisProvider);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it('type=claude builds ClaudeCliAnalysisProvider (preserves Phase 0–2 behavior)', () => {
    const def: BackendDef = { type: 'claude', command: 'claude' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'cli',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(ClaudeCliAnalysisProvider);
  });

  it('type=openai builds OpenAICompatible with cloud baseUrl', () => {
    const def: BackendDef = { type: 'openai', model: 'gpt-4', apiKey: 'k' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'cloud',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
  });

  it('SC36: type=mock returns null and warns naming backend + layer', () => {
    const warnSpy = vi.fn();
    const def: BackendDef = { type: 'mock' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'mock-cloud',
      layer: 'pesl',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: { ...noopLogger, warn: warnSpy },
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    const msg = String(warnSpy.mock.calls[0]?.[0]);
    expect(msg).toContain('mock-cloud');
    expect(msg).toMatch(/pesl/);
    expect(msg).toMatch(/mock/);
  });

  it('SC36: type=gemini returns null and warns (no GeminiAnalysisProvider exists)', () => {
    const warnSpy = vi.fn();
    const def: BackendDef = { type: 'gemini', model: 'gemini-pro', apiKey: 'k' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'gem',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: { ...noopLogger, warn: warnSpy },
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('gemini');
  });
});
