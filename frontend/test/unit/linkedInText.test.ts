import { describe, expect, it } from 'vitest';
import type { Entry } from '@profile/shared';
import { linkedInText } from '../../src/pages/PostsPage';

const post = (content: string, hashtags: string) => ({ id: 'x', createdAt: '', updatedAt: '', title: 'T', content, hashtags }) as Entry;

describe('linkedInText', () => {
  it('puts the hashtags after the content, a blank line apart', () => {
    expect(linkedInText(post('Hello.', '#film, engineering'))).toBe('Hello.\n\n#film #engineering');
  });

  it("doesn't repeat hashtags the content already has, ignoring case", () => {
    expect(linkedInText(post('Hello.\n\n#Film #AI', '#film, #ai'))).toBe('Hello.\n\n#Film #AI');
    expect(linkedInText(post('Hello.\n\n#film', '#film, #new'))).toBe('Hello.\n\n#film\n\n#new');
  });
});
