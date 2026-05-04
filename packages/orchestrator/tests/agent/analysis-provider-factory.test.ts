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
      getResolverStatusSnapshot: () => ({
        available: true,
        resolved: 'gemma-4-e4b',
        configured: ['gemma-4-e4b'],
        detected: ['gemma-4-e4b'],
      }),
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
      getResolverStatusSnapshot: () => ({
        available: true,
        resolved: 'a',
        configured: ['a', 'b'],
        detected: ['a'],
      }),
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
      getResolverStatusSnapshot: () => ({
        available: false,
        resolved: null,
        configured: ['gemma-4-e4b'],
        detected: [],
      }),
      intelligence: { enabled: true },
      logger: { ...noopLogger, warn: warnSpy },
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/Intelligence pipeline disabled/i);
  });

  // Spec 2 P3-IMP-1 fixup: the local-resolver-unavailable warn must
  // include both `Configured: [...]` and `Detected: [...]` lists so
  // operators have at-a-glance triage data without grepping resolver
  // logs. Pre-Phase-4 createAnalysisProvider emitted these directly
  // (orchestrator.ts pre-rewrite line 621-624); the Phase 4 factory
  // rewrite dropped them and the masking OT4 assertion was restored
  // alongside this unit-level cover.
  it('P3-IMP-1: local-unavailable warn includes Configured + Detected diagnostic lists', () => {
    const warnSpy = vi.fn();
    const def: BackendDef = {
      type: 'local',
      endpoint: 'http://localhost:11434/v1',
      model: ['gemma-4-e4b', 'qwen-2'],
    };
    const result = buildAnalysisProvider({
      def,
      backendName: 'local',
      layer: 'sel',
      getResolverStatusSnapshot: () => ({
        available: false,
        resolved: null,
        configured: ['gemma-4-e4b', 'qwen-2'],
        detected: ['llama-3', 'phi-3'],
      }),
      intelligence: { enabled: true },
      logger: { ...noopLogger, warn: warnSpy },
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    const msg = String(warnSpy.mock.calls[0]?.[0]);
    expect(msg).toMatch(/Intelligence pipeline disabled for backend 'local'/);
    expect(msg).toContain('http://localhost:11434/v1');
    expect(msg).toMatch(/Configured: \[gemma-4-e4b, qwen-2\]/);
    expect(msg).toMatch(/Detected: \[llama-3, phi-3\]/);
  });

  it('SC32: type=anthropic builds AnthropicAnalysisProvider', () => {
    const def: BackendDef = { type: 'anthropic', model: 'claude-3', apiKey: 'k' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'cloud',
      layer: 'sel',
      getResolverStatusSnapshot: () => null,
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
        getResolverStatusSnapshot: () => null,
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
      getResolverStatusSnapshot: () => null,
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
      getResolverStatusSnapshot: () => null,
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
      getResolverStatusSnapshot: () => null,
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
      getResolverStatusSnapshot: () => null,
      intelligence: { enabled: true },
      logger: { ...noopLogger, warn: warnSpy },
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('gemini');
  });
});
