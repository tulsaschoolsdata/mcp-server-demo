import {
  Pattern,
  PatternIndexEntry,
  IntentMatch,
} from '../types.js';
import { matchTriggers, calculateSimilarity } from '../utils/helpers.js';

/**
 * Pattern Matcher for identifying user intent and matching to patterns
 */
export class PatternMatcher {
  private patterns: Pattern[] = [];
  private patternIndex: PatternIndexEntry[] = [];

  /**
   * Load patterns for matching
   */
  loadPatterns(patterns: Pattern[]): void {
    this.patterns = patterns;
    this.patternIndex = patterns.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      triggers: p.triggers,
      tags: p.tags,
    }));
  }

  /**
   * Identify intent from user input
   */
  identifyIntent(input: string): IntentMatch | null {
    const scores: { pattern: Pattern; score: number; matchedTriggers: string[] }[] = [];

    for (const pattern of this.patterns) {
      const { score, matchedTriggers } = this.scorePattern(input, pattern);
      if (score > 0.3) {
        scores.push({ pattern, score, matchedTriggers });
      }
    }

    if (scores.length === 0) {
      return null;
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    const best = scores[0];

    // Get alternative patterns (score > 0.5 and within 0.2 of best)
    const alternativePatterns = scores
      .slice(1)
      .filter((s) => s.score > 0.5 && best.score - s.score < 0.2)
      .map((s) => ({
        patternId: s.pattern.id,
        confidence: s.score,
      }));

    return {
      patternId: best.pattern.id,
      confidence: best.score,
      matchedTriggers: best.matchedTriggers,
      alternativePatterns:
        alternativePatterns.length > 0 ? alternativePatterns : undefined,
    };
  }

  /**
   * Score a pattern against user input
   */
  private scorePattern(
    input: string,
    pattern: Pattern
  ): { score: number; matchedTriggers: string[] } {
    const inputLower = input.toLowerCase();
    const matchedTriggers: string[] = [];
    let maxScore = 0;

    // Check triggers
    for (const trigger of pattern.triggers) {
      const triggerLower = trigger.toLowerCase();

      // Exact phrase match
      if (inputLower.includes(triggerLower)) {
        matchedTriggers.push(trigger);
        maxScore = Math.max(maxScore, 1.0);
        continue;
      }

      // Word overlap scoring
      const triggerScore = matchTriggers(input, [trigger]);
      if (triggerScore > 0.5) {
        matchedTriggers.push(trigger);
        maxScore = Math.max(maxScore, triggerScore);
      }
    }

    // Check pattern name
    const nameScore = calculateSimilarity(input, pattern.name);
    if (nameScore > 0.5) {
      maxScore = Math.max(maxScore, nameScore * 0.8);
    }

    // Check tags
    for (const tag of pattern.tags) {
      if (inputLower.includes(tag.toLowerCase())) {
        maxScore = Math.max(maxScore, 0.6);
      }
    }

    // Check category keywords
    const categoryKeywords = this.getCategoryKeywords(pattern.category);
    for (const keyword of categoryKeywords) {
      if (inputLower.includes(keyword)) {
        maxScore = Math.max(maxScore, 0.5);
      }
    }

    return { score: maxScore, matchedTriggers };
  }

  /**
   * Get keywords associated with a category
   */
  private getCategoryKeywords(category: string): string[] {
    const keywords: Record<string, string[]> = {
      model: ['model', 'table', 'database', 'schema', 'activerecord'],
      controller: ['controller', 'action', 'endpoint', 'route'],
      view: ['view', 'page', 'template', 'erb'],
      component: ['component', 'react', 'ui', 'widget'],
      authentication: ['auth', 'login', 'logout', 'session', 'password', 'signup'],
      authorization: ['permission', 'role', 'access', 'authorize', 'policy'],
      api: ['api', 'json', 'rest', 'endpoint'],
      'background-job': ['job', 'worker', 'async', 'background', 'sidekiq', 'queue'],
      migration: ['migration', 'schema', 'alter', 'add column'],
      'full-stack': ['crud', 'resource', 'scaffold'],
    };

    return keywords[category] || [];
  }

  /**
   * Search patterns by query
   */
  searchPatterns(query: string, limit: number = 10): PatternIndexEntry[] {
    const scored = this.patternIndex.map((entry) => {
      const pattern = this.patterns.find((p) => p.id === entry.id)!;
      const { score } = this.scorePattern(query, pattern);
      return { entry, score };
    });

    return scored
      .filter((s) => s.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.entry);
  }

  /**
   * Get a pattern by ID
   */
  getPattern(id: string): Pattern | undefined {
    return this.patterns.find((p) => p.id === id);
  }

  /**
   * Get patterns by category
   */
  getPatternsByCategory(category: string): Pattern[] {
    return this.patterns.filter((p) => p.category === category);
  }

  /**
   * Get patterns by tag
   */
  getPatternsByTag(tag: string): Pattern[] {
    return this.patterns.filter((p) =>
      p.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
    );
  }

  /**
   * Suggest related patterns based on a pattern
   */
  suggestRelated(patternId: string, limit: number = 5): Pattern[] {
    const pattern = this.getPattern(patternId);
    if (!pattern) return [];

    const scored = this.patterns
      .filter((p) => p.id !== patternId)
      .map((p) => {
        let score = 0;

        // Same category bonus
        if (p.category === pattern.category) {
          score += 0.5;
        }

        // Tag overlap
        const commonTags = p.tags.filter((t) =>
          pattern.tags.some((pt) => pt.toLowerCase() === t.toLowerCase())
        );
        score += commonTags.length * 0.2;

        // Trigger similarity
        for (const trigger of p.triggers) {
          for (const patternTrigger of pattern.triggers) {
            score += calculateSimilarity(trigger, patternTrigger) * 0.1;
          }
        }

        return { pattern: p, score };
      });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.pattern);
  }

  /**
   * Generate clarifying questions when intent is ambiguous
   */
  generateClarifyingQuestions(
    input: string,
    candidates: IntentMatch[]
  ): { question: string; options: { patternId: string; label: string }[] } {
    const options = candidates.map((c) => {
      const pattern = this.getPattern(c.patternId)!;
      return {
        patternId: c.patternId,
        label: `${pattern.name}: ${pattern.description}`,
      };
    });

    return {
      question: `I found multiple patterns that might match "${input}". Which one would you like to use?`,
      options,
    };
  }

  /**
   * Get all pattern categories
   */
  getCategories(): { category: string; count: number }[] {
    const categoryMap = new Map<string, number>();

    for (const pattern of this.patterns) {
      const count = categoryMap.get(pattern.category) || 0;
      categoryMap.set(pattern.category, count + 1);
    }

    return Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get all unique tags
   */
  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const pattern of this.patterns) {
      pattern.tags.forEach((t) => tags.add(t.toLowerCase()));
    }
    return Array.from(tags).sort();
  }
}
