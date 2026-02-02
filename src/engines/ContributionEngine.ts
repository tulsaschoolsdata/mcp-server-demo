import * as path from 'path';
import {
  Contribution,
  ContributionSource,
  Pattern,
  Template,
  Snippet,
  ExtractedPattern,
  ExtractedTemplate,
  ExtractedSnippet,
  AnalysisResult,
} from '../types.js';
import {
  generateId,
  readFile,
  writeFile,
  readJsonFile,
  writeJsonFile,
  fileExists,
  findFiles,
  ensureDirectory,
} from '../utils/helpers.js';

/**
 * Contribution Engine for managing learned patterns
 */
export class ContributionEngine {
  private libraryPath: string;
  private pendingPath: string;
  private approvedPath: string;

  constructor(libraryPath: string) {
    this.libraryPath = libraryPath;
    this.pendingPath = path.join(libraryPath, 'learned', 'pending_review');
    this.approvedPath = path.join(libraryPath, 'learned', 'approved');
  }

  /**
   * Initialize directory structure
   */
  async initialize(): Promise<void> {
    await ensureDirectory(this.pendingPath);
    await ensureDirectory(this.approvedPath);
  }

  /**
   * Create contribution proposals from analysis result
   */
  async proposeFromAnalysis(result: AnalysisResult): Promise<Contribution[]> {
    const contributions: Contribution[] = [];

    // Propose patterns
    for (const extracted of result.extractedPatterns) {
      if (extracted.confidence >= 0.5) {
        const contribution = await this.createPatternContribution(
          extracted,
          result.projectPath
        );
        contributions.push(contribution);
      }
    }

    // Propose templates
    for (const extracted of result.extractedTemplates) {
      if (extracted.confidence >= 0.5) {
        const contribution = await this.createTemplateContribution(
          extracted,
          result.projectPath
        );
        contributions.push(contribution);
      }
    }

    // Propose snippets
    for (const extracted of result.extractedSnippets) {
      if (extracted.confidence >= 0.5) {
        const contribution = await this.createSnippetContribution(
          extracted,
          result.projectPath
        );
        contributions.push(contribution);
      }
    }

    // Save pending contributions
    for (const contribution of contributions) {
      await this.savePendingContribution(contribution);
    }

    return contributions;
  }

  /**
   * Create a pattern contribution
   */
  private async createPatternContribution(
    extracted: ExtractedPattern,
    projectPath: string
  ): Promise<Contribution> {
    const pattern: Pattern = {
      id: extracted.suggestedId,
      name: extracted.name,
      description: extracted.description,
      category: 'full-stack', // Default, can be refined
      triggers: [extracted.name.toLowerCase()],
      workflow: {
        id: `wf-${extracted.suggestedId}`,
        steps: [],
        context_requirements: [],
      },
      templates: [],
      snippets: [],
      version: '1.0.0',
      tags: ['auto-extracted'],
    };

    return {
      id: generateId('contrib'),
      type: 'pattern',
      status: 'pending',
      source: {
        type: 'analysis',
        projectPath,
        files: extracted.sourceFiles,
      },
      content: pattern,
      metadata: {
        extractedFrom: projectPath,
        similarity: extracted.existingSimilar ? 0.8 : 0,
        qualityScore: extracted.confidence,
      },
      createdAt: new Date(),
    };
  }

  /**
   * Create a template contribution
   */
  private async createTemplateContribution(
    extracted: ExtractedTemplate,
    projectPath: string
  ): Promise<Contribution> {
    const template: Template = {
      id: extracted.suggestedId,
      name: extracted.name,
      description: `Auto-extracted from ${path.basename(extracted.sourceFile)}`,
      category: extracted.category,
      language: this.detectLanguage(extracted.sourceFile) as Template['language'],
      filePath: `templates/${extracted.suggestedId}.ejs`,
      outputPath: extracted.sourceFile, // Will be generalized
      variables: extracted.variables,
      version: '1.0.0',
      tags: ['auto-extracted'],
    };

    return {
      id: generateId('contrib'),
      type: 'template',
      status: 'pending',
      source: {
        type: 'analysis',
        projectPath,
        files: [extracted.sourceFile],
      },
      content: template,
      metadata: {
        extractedFrom: projectPath,
        qualityScore: extracted.confidence,
      },
      createdAt: new Date(),
    };
  }

  /**
   * Create a snippet contribution
   */
  private async createSnippetContribution(
    extracted: ExtractedSnippet,
    projectPath: string
  ): Promise<Contribution> {
    const snippet: Snippet = {
      id: extracted.suggestedId,
      name: extracted.name,
      description: `Auto-extracted snippet used ${extracted.usageCount} times`,
      category: extracted.category,
      language: this.detectLanguage(extracted.sourceFile),
      code: extracted.code,
      tags: ['auto-extracted'],
    };

    return {
      id: generateId('contrib'),
      type: 'snippet',
      status: 'pending',
      source: {
        type: 'analysis',
        projectPath,
        files: [extracted.sourceFile],
      },
      content: snippet,
      metadata: {
        extractedFrom: projectPath,
        usageCount: extracted.usageCount,
        qualityScore: extracted.confidence,
      },
      createdAt: new Date(),
    };
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mapping: Record<string, string> = {
      '.rb': 'ruby',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.css': 'css',
      '.scss': 'css',
      '.erb': 'erb',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.json': 'json',
    };
    return mapping[ext] || 'text';
  }

  /**
   * Save a pending contribution to disk
   */
  private async savePendingContribution(contribution: Contribution): Promise<void> {
    const filename = `${contribution.id}.json`;
    const filepath = path.join(this.pendingPath, filename);
    await writeJsonFile(filepath, contribution);
  }

  /**
   * List all pending contributions
   */
  async listPending(): Promise<Contribution[]> {
    const files = await findFiles('*.json', this.pendingPath);
    const contributions: Contribution[] = [];

    for (const file of files) {
      try {
        const contribution = await readJsonFile<Contribution>(file);
        contributions.push(contribution);
      } catch {
        // Skip invalid files
      }
    }

    return contributions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Get a specific contribution
   */
  async getContribution(id: string): Promise<Contribution | null> {
    const pendingPath = path.join(this.pendingPath, `${id}.json`);
    const approvedPath = path.join(this.approvedPath, `${id}.json`);

    if (await fileExists(pendingPath)) {
      return readJsonFile<Contribution>(pendingPath);
    }

    if (await fileExists(approvedPath)) {
      return readJsonFile<Contribution>(approvedPath);
    }

    return null;
  }

  /**
   * Approve a contribution
   */
  async approveContribution(
    id: string,
    reviewNotes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const contribution = await this.getContribution(id);

    if (!contribution) {
      return { success: false, error: 'Contribution not found' };
    }

    if (contribution.status !== 'pending') {
      return { success: false, error: 'Contribution is not pending' };
    }

    // Update status
    contribution.status = 'approved';
    contribution.reviewedAt = new Date();
    contribution.reviewNotes = reviewNotes;

    // Move to approved directory
    const pendingPath = path.join(this.pendingPath, `${id}.json`);
    const approvedFilePath = path.join(this.approvedPath, `${id}.json`);

    await writeJsonFile(approvedFilePath, contribution);

    // Add to library
    await this.addToLibrary(contribution);

    // Remove from pending
    try {
      const fs = await import('fs');
      await fs.promises.unlink(pendingPath);
    } catch {
      // File may not exist
    }

    return { success: true };
  }

  /**
   * Add approved contribution to library
   */
  private async addToLibrary(contribution: Contribution): Promise<void> {
    switch (contribution.type) {
      case 'pattern':
        await this.addPatternToLibrary(contribution.content as Pattern);
        break;
      case 'template':
        await this.addTemplateToLibrary(contribution.content as Template);
        break;
      case 'snippet':
        await this.addSnippetToLibrary(contribution.content as Snippet);
        break;
    }
  }

  /**
   * Add pattern to library
   */
  private async addPatternToLibrary(pattern: Pattern): Promise<void> {
    const patternDir = path.join(this.libraryPath, 'patterns', pattern.id);
    await ensureDirectory(patternDir);

    await writeJsonFile(path.join(patternDir, 'manifest.json'), pattern);

    // Update index
    await this.updatePatternIndex(pattern);
  }

  /**
   * Add template to library
   */
  private async addTemplateToLibrary(template: Template): Promise<void> {
    const templatePath = path.join(
      this.libraryPath,
      'templates',
      `${template.id}.json`
    );
    await writeJsonFile(templatePath, template);

    // Update index
    await this.updateTemplateIndex(template);
  }

  /**
   * Add snippet to library
   */
  private async addSnippetToLibrary(snippet: Snippet): Promise<void> {
    const snippetPath = path.join(
      this.libraryPath,
      'snippets',
      `${snippet.id}.json`
    );
    await writeJsonFile(snippetPath, snippet);

    // Update index
    await this.updateSnippetIndex(snippet);
  }

  /**
   * Update pattern index
   */
  private async updatePatternIndex(pattern: Pattern): Promise<void> {
    const indexPath = path.join(this.libraryPath, 'patterns', 'index.json');

    let index: { patterns: Array<{ id: string; name: string; category: string }> };

    try {
      index = await readJsonFile(indexPath);
    } catch {
      index = { patterns: [] };
    }

    // Remove existing entry
    index.patterns = index.patterns.filter((p) => p.id !== pattern.id);

    // Add new entry
    index.patterns.push({
      id: pattern.id,
      name: pattern.name,
      category: pattern.category,
    });

    await writeJsonFile(indexPath, index);
  }

  /**
   * Update template index
   */
  private async updateTemplateIndex(template: Template): Promise<void> {
    const indexPath = path.join(this.libraryPath, 'templates', 'index.json');

    let index: { templates: Array<{ id: string; name: string; category: string }> };

    try {
      index = await readJsonFile(indexPath);
    } catch {
      index = { templates: [] };
    }

    index.templates = index.templates.filter((t) => t.id !== template.id);

    index.templates.push({
      id: template.id,
      name: template.name,
      category: template.category,
    });

    await writeJsonFile(indexPath, index);
  }

  /**
   * Update snippet index
   */
  private async updateSnippetIndex(snippet: Snippet): Promise<void> {
    const indexPath = path.join(this.libraryPath, 'snippets', 'index.json');

    let index: { snippets: Array<{ id: string; name: string; category: string }> };

    try {
      index = await readJsonFile(indexPath);
    } catch {
      index = { snippets: [] };
    }

    index.snippets = index.snippets.filter((s) => s.id !== snippet.id);

    index.snippets.push({
      id: snippet.id,
      name: snippet.name,
      category: snippet.category,
    });

    await writeJsonFile(indexPath, index);
  }

  /**
   * Reject a contribution
   */
  async rejectContribution(
    id: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const contribution = await this.getContribution(id);

    if (!contribution) {
      return { success: false, error: 'Contribution not found' };
    }

    if (contribution.status !== 'pending') {
      return { success: false, error: 'Contribution is not pending' };
    }

    // Update status
    contribution.status = 'rejected';
    contribution.reviewedAt = new Date();
    contribution.reviewNotes = reason;

    // Move to rejected archive (optional)
    const rejectedPath = path.join(this.libraryPath, 'learned', 'rejected');
    await ensureDirectory(rejectedPath);

    await writeJsonFile(path.join(rejectedPath, `${id}.json`), contribution);

    // Remove from pending
    const pendingPath = path.join(this.pendingPath, `${id}.json`);
    try {
      const fs = await import('fs');
      await fs.promises.unlink(pendingPath);
    } catch {
      // File may not exist
    }

    return { success: true };
  }

  /**
   * Propose a manual contribution
   */
  async proposeManual(
    type: 'pattern' | 'template' | 'snippet',
    content: Pattern | Template | Snippet
  ): Promise<Contribution> {
    const contribution: Contribution = {
      id: generateId('contrib'),
      type,
      status: 'pending',
      source: {
        type: 'manual',
        files: [],
      },
      content,
      metadata: {
        extractedFrom: 'manual',
        qualityScore: 1.0,
      },
      createdAt: new Date(),
    };

    await this.savePendingContribution(contribution);

    return contribution;
  }

  /**
   * Get contribution statistics
   */
  async getStatistics(): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    byType: Record<string, number>;
  }> {
    const pendingFiles = await findFiles('*.json', this.pendingPath);
    const approvedFiles = await findFiles('*.json', this.approvedPath);

    const rejectedPath = path.join(this.libraryPath, 'learned', 'rejected');
    let rejectedFiles: string[] = [];
    try {
      rejectedFiles = await findFiles('*.json', rejectedPath);
    } catch {
      // Rejected directory may not exist
    }

    const pending = await this.listPending();
    const byType: Record<string, number> = {
      pattern: 0,
      template: 0,
      snippet: 0,
    };

    for (const contribution of pending) {
      byType[contribution.type]++;
    }

    return {
      pending: pendingFiles.length,
      approved: approvedFiles.length,
      rejected: rejectedFiles.length,
      byType,
    };
  }

  /**
   * Merge similar contributions
   */
  async mergeSimilar(ids: string[]): Promise<Contribution | null> {
    const contributions = await Promise.all(
      ids.map((id) => this.getContribution(id))
    );

    const valid = contributions.filter((c) => c !== null) as Contribution[];

    if (valid.length < 2) {
      return null;
    }

    // All must be same type
    const types = new Set(valid.map((c) => c.type));
    if (types.size !== 1) {
      return null;
    }

    // For now, just take the first one with merged metadata
    const merged = valid[0];
    merged.id = generateId('contrib');
    merged.metadata.qualityScore = Math.max(
      ...valid.map((c) => c.metadata.qualityScore || 0)
    );

    // Remove originals
    for (const id of ids) {
      await this.rejectContribution(id, 'Merged into ' + merged.id);
    }

    await this.savePendingContribution(merged);

    return merged;
  }
}
