import {
  camelize,
  underscore,
  pluralize,
  singularize,
  tableize,
  classify,
  humanize,
  matchTriggers,
  calculateSimilarity,
} from '../src/utils/helpers';

describe('String helpers', () => {
  describe('camelize', () => {
    it('converts underscore to camelCase', () => {
      expect(camelize('hello_world')).toBe('HelloWorld');
      expect(camelize('user_profile')).toBe('UserProfile');
    });

    it('converts hyphenated to camelCase', () => {
      expect(camelize('hello-world')).toBe('HelloWorld');
    });
  });

  describe('underscore', () => {
    it('converts camelCase to underscore', () => {
      expect(underscore('HelloWorld')).toBe('hello_world');
      expect(underscore('UserProfile')).toBe('user_profile');
    });
  });

  describe('pluralize', () => {
    it('handles regular plurals', () => {
      expect(pluralize('post')).toBe('posts');
      expect(pluralize('user')).toBe('users');
    });

    it('handles -y endings', () => {
      expect(pluralize('category')).toBe('categories');
      expect(pluralize('company')).toBe('companies');
    });

    it('handles -s, -x, -ch, -sh endings', () => {
      expect(pluralize('bus')).toBe('buses');
      expect(pluralize('box')).toBe('boxes');
      expect(pluralize('match')).toBe('matches');
      expect(pluralize('wish')).toBe('wishes');
    });

    it('handles irregular plurals', () => {
      expect(pluralize('person')).toBe('people');
      expect(pluralize('child')).toBe('children');
    });
  });

  describe('singularize', () => {
    it('handles regular singulars', () => {
      expect(singularize('posts')).toBe('post');
      expect(singularize('users')).toBe('user');
    });

    it('handles -ies endings', () => {
      expect(singularize('categories')).toBe('category');
    });

    it('handles irregular singulars', () => {
      expect(singularize('people')).toBe('person');
      expect(singularize('children')).toBe('child');
    });
  });

  describe('tableize', () => {
    it('converts class name to table name', () => {
      expect(tableize('User')).toBe('users');
      expect(tableize('BlogPost')).toBe('blog_posts');
    });
  });

  describe('classify', () => {
    it('converts table name to class name', () => {
      expect(classify('users')).toBe('User');
      expect(classify('blog_posts')).toBe('BlogPost');
    });
  });

  describe('humanize', () => {
    it('converts underscore to human readable', () => {
      expect(humanize('first_name')).toBe('First name');
      expect(humanize('user_id')).toBe('User id');
    });
  });
});

describe('Matching helpers', () => {
  describe('matchTriggers', () => {
    it('returns 1.0 for exact match', () => {
      const score = matchTriggers('create a model', ['create a model']);
      expect(score).toBe(1.0);
    });

    it('returns partial score for word overlap', () => {
      const score = matchTriggers('add a new user model', ['create model']);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('returns 0 for no match', () => {
      const score = matchTriggers('hello world', ['create model']);
      expect(score).toBe(0);
    });
  });

  describe('calculateSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      expect(calculateSimilarity('hello', 'hello')).toBe(1.0);
    });

    it('returns partial score for similar strings', () => {
      const score = calculateSimilarity('hello world', 'hello there');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });
});
