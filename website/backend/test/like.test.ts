import { describe, expect, it } from 'vitest';
import { likeEscape } from '../src/lib/like';

const B = String.fromCharCode(92); // a single backslash

describe('likeEscape', () => {
  it('puts a backslash before %, _ and backslash and leaves other text alone', () => {
    expect(likeEscape('50%')).toBe('50' + B + '%');
    expect(likeEscape('a_b')).toBe('a' + B + '_b');
    expect(likeEscape('a' + B + 'b')).toBe('a' + B + B + 'b');
    expect(likeEscape('%_' + B)).toBe(B + '%' + B + '_' + B + B);
    expect(likeEscape('plain text 123')).toBe('plain text 123');
    expect(likeEscape('')).toBe('');
  });
  it('never emits a template placeholder', () => {
    expect(likeEscape('%')).toBe(B + '%');
    expect(likeEscape('%')).toHaveLength(2);
  });
});
