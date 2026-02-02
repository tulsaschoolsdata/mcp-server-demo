import { CssFramework } from '../types.js';
import { readFile, findFiles } from '../utils/helpers.js';
import * as path from 'path';

/**
 * CSS/SCSS/Tailwind parser
 */
export class CssParser {
  /**
   * Detect CSS framework used in project
   */
  async detectFramework(projectPath: string): Promise<CssFramework> {
    // Check for Tailwind
    const hasTailwind = await this.hasTailwindConfig(projectPath);
    if (hasTailwind) return 'tailwind';

    // Check for Bootstrap
    const hasBootstrap = await this.hasBootstrap(projectPath);
    if (hasBootstrap) return 'bootstrap';

    // Check for any CSS files
    const cssFiles = await findFiles('**/*.css', projectPath);
    if (cssFiles.length > 0) return 'custom';

    return 'none';
  }

  /**
   * Check for Tailwind configuration
   */
  private async hasTailwindConfig(projectPath: string): Promise<boolean> {
    const configFiles = [
      'tailwind.config.js',
      'tailwind.config.ts',
      'tailwind.config.cjs',
      'tailwind.config.mjs',
    ];

    for (const file of configFiles) {
      try {
        await readFile(path.join(projectPath, file));
        return true;
      } catch {
        // Continue checking
      }
    }

    // Check package.json for tailwindcss
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const content = await readFile(pkgPath);
      const pkg = JSON.parse(content);
      if (pkg.dependencies?.tailwindcss || pkg.devDependencies?.tailwindcss) {
        return true;
      }
    } catch {
      // No package.json
    }

    return false;
  }

  /**
   * Check for Bootstrap
   */
  private async hasBootstrap(projectPath: string): Promise<boolean> {
    // Check package.json
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const content = await readFile(pkgPath);
      const pkg = JSON.parse(content);
      if (pkg.dependencies?.bootstrap || pkg.devDependencies?.bootstrap) {
        return true;
      }
    } catch {
      // No package.json
    }

    // Check Gemfile for bootstrap gem
    try {
      const gemfilePath = path.join(projectPath, 'Gemfile');
      const content = await readFile(gemfilePath);
      if (content.includes('bootstrap')) {
        return true;
      }
    } catch {
      // No Gemfile
    }

    // Check for bootstrap imports in CSS/SCSS files
    const scssFiles = await findFiles('**/*.scss', projectPath);
    for (const file of scssFiles) {
      try {
        const content = await readFile(file);
        if (
          content.includes('@import "bootstrap') ||
          content.includes("@import 'bootstrap") ||
          content.includes('@import "~bootstrap')
        ) {
          return true;
        }
      } catch {
        // Continue
      }
    }

    return false;
  }

  /**
   * Extract CSS classes from a stylesheet
   */
  async extractClasses(filePath: string): Promise<string[]> {
    try {
      const content = await readFile(filePath);
      return this.extractClassesFromContent(content);
    } catch {
      return [];
    }
  }

  /**
   * Extract classes from CSS content
   */
  extractClassesFromContent(content: string): string[] {
    const classes = new Set<string>();

    // Match class selectors
    const classRegex = /\.([a-zA-Z_-][\w-]*)/g;
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      // Filter out pseudo-classes and media queries
      const className = match[1];
      if (
        !className.startsWith('-') &&
        !['hover', 'focus', 'active', 'visited', 'first', 'last', 'before', 'after'].includes(className)
      ) {
        classes.add(className);
      }
    }

    return Array.from(classes);
  }

  /**
   * Extract CSS variables
   */
  async extractVariables(filePath: string): Promise<Record<string, string>> {
    try {
      const content = await readFile(filePath);
      return this.extractVariablesFromContent(content);
    } catch {
      return {};
    }
  }

  /**
   * Extract CSS variables from content
   */
  extractVariablesFromContent(content: string): Record<string, string> {
    const variables: Record<string, string> = {};

    // CSS custom properties
    const cssVarRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
    let match;

    while ((match = cssVarRegex.exec(content)) !== null) {
      variables[`--${match[1]}`] = match[2].trim();
    }

    // SCSS variables
    const scssVarRegex = /\$([\w-]+)\s*:\s*([^;]+);/g;
    while ((match = scssVarRegex.exec(content)) !== null) {
      variables[`$${match[1]}`] = match[2].trim();
    }

    return variables;
  }

  /**
   * Extract color palette from CSS
   */
  async extractColorPalette(projectPath: string): Promise<Record<string, string>> {
    const colors: Record<string, string> = {};
    const colorRegex = /#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)/g;

    const cssFiles = await findFiles('**/*.{css,scss,sass}', projectPath);

    for (const file of cssFiles) {
      try {
        const content = await readFile(file);

        // Extract variables that contain colors
        const varMatches = content.matchAll(/(?:--|$)([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\)|hsl[a]?\([^)]+\))/g);

        for (const match of varMatches) {
          colors[match[1]] = match[2];
        }
      } catch {
        // Continue
      }
    }

    return colors;
  }

  /**
   * Analyze Bootstrap usage patterns
   */
  async analyzeBootstrapUsage(
    projectPath: string
  ): Promise<{ classes: string[]; components: string[] }> {
    const bootstrapClasses = new Set<string>();
    const bootstrapComponents = new Set<string>();

    // Common Bootstrap class prefixes
    const bootstrapPrefixes = [
      'btn',
      'card',
      'nav',
      'modal',
      'form',
      'input',
      'table',
      'alert',
      'badge',
      'container',
      'row',
      'col',
      'd-',
      'p-',
      'm-',
      'text-',
      'bg-',
      'border',
      'rounded',
      'shadow',
      'dropdown',
      'carousel',
      'accordion',
      'list-group',
      'spinner',
      'progress',
      'toast',
      'offcanvas',
      'popover',
      'tooltip',
    ];

    const componentMapping: Record<string, string> = {
      'btn': 'Button',
      'card': 'Card',
      'nav': 'Nav',
      'modal': 'Modal',
      'form': 'Form',
      'table': 'Table',
      'alert': 'Alert',
      'badge': 'Badge',
      'dropdown': 'Dropdown',
      'carousel': 'Carousel',
      'accordion': 'Accordion',
      'list-group': 'ListGroup',
      'spinner': 'Spinner',
      'progress': 'Progress',
      'toast': 'Toast',
      'offcanvas': 'Offcanvas',
    };

    // Search in view files and components
    const patterns = [
      '**/*.erb',
      '**/*.tsx',
      '**/*.jsx',
      '**/*.html',
    ];

    for (const pattern of patterns) {
      const files = await findFiles(pattern, projectPath);

      for (const file of files) {
        try {
          const content = await readFile(file);

          // Extract class names
          const classMatches = content.matchAll(/class(?:Name)?=["']([^"']+)["']/g);

          for (const match of classMatches) {
            const classes = match[1].split(/\s+/);
            for (const cls of classes) {
              for (const prefix of bootstrapPrefixes) {
                if (cls.startsWith(prefix)) {
                  bootstrapClasses.add(cls);

                  // Identify component
                  const basePrefix = prefix.replace(/-$/, '');
                  if (componentMapping[basePrefix]) {
                    bootstrapComponents.add(componentMapping[basePrefix]);
                  }
                  break;
                }
              }
            }
          }
        } catch {
          // Continue
        }
      }
    }

    return {
      classes: Array.from(bootstrapClasses),
      components: Array.from(bootstrapComponents),
    };
  }

  /**
   * Analyze Tailwind usage patterns
   */
  async analyzeTailwindUsage(
    projectPath: string
  ): Promise<{ classes: string[]; customizations: string[] }> {
    const tailwindClasses = new Set<string>();
    const customizations: string[] = [];

    // Common Tailwind prefixes
    const tailwindPrefixes = [
      'flex',
      'grid',
      'block',
      'inline',
      'hidden',
      'w-',
      'h-',
      'p-',
      'm-',
      'px-',
      'py-',
      'mx-',
      'my-',
      'mt-',
      'mb-',
      'ml-',
      'mr-',
      'pt-',
      'pb-',
      'pl-',
      'pr-',
      'text-',
      'font-',
      'bg-',
      'border',
      'rounded',
      'shadow',
      'opacity',
      'z-',
      'gap-',
      'space-',
      'items-',
      'justify-',
      'content-',
      'self-',
      'order-',
      'col-',
      'row-',
      'animate-',
      'transition',
      'duration-',
      'ease-',
      'hover:',
      'focus:',
      'active:',
      'disabled:',
      'dark:',
      'sm:',
      'md:',
      'lg:',
      'xl:',
      '2xl:',
    ];

    // Search in view files and components
    const patterns = [
      '**/*.erb',
      '**/*.tsx',
      '**/*.jsx',
      '**/*.html',
    ];

    for (const pattern of patterns) {
      const files = await findFiles(pattern, projectPath);

      for (const file of files) {
        try {
          const content = await readFile(file);

          const classMatches = content.matchAll(/class(?:Name)?=["']([^"']+)["']/g);

          for (const match of classMatches) {
            const classes = match[1].split(/\s+/);
            for (const cls of classes) {
              for (const prefix of tailwindPrefixes) {
                if (cls.startsWith(prefix) || cls === prefix.replace(/-$/, '')) {
                  tailwindClasses.add(cls);
                  break;
                }
              }
            }
          }
        } catch {
          // Continue
        }
      }
    }

    // Check for Tailwind customizations
    const configFiles = [
      'tailwind.config.js',
      'tailwind.config.ts',
    ];

    for (const configFile of configFiles) {
      try {
        const content = await readFile(path.join(projectPath, configFile));

        if (content.includes('extend')) {
          customizations.push('theme extensions');
        }
        if (content.includes('plugins')) {
          customizations.push('custom plugins');
        }
        if (content.includes('colors')) {
          customizations.push('custom colors');
        }
        if (content.includes('fontFamily')) {
          customizations.push('custom fonts');
        }
      } catch {
        // Continue
      }
    }

    return {
      classes: Array.from(tailwindClasses),
      customizations,
    };
  }

  /**
   * Generate Tailwind equivalents for Bootstrap classes
   */
  bootstrapToTailwind(bootstrapClasses: string[]): Record<string, string> {
    const mapping: Record<string, string> = {
      // Layout
      'container': 'container mx-auto px-4',
      'container-fluid': 'w-full px-4',
      'row': 'flex flex-wrap -mx-4',
      'col': 'px-4 flex-1',
      'col-1': 'w-1/12 px-4',
      'col-2': 'w-2/12 px-4',
      'col-3': 'w-3/12 px-4',
      'col-4': 'w-4/12 px-4',
      'col-5': 'w-5/12 px-4',
      'col-6': 'w-6/12 px-4',
      'col-7': 'w-7/12 px-4',
      'col-8': 'w-8/12 px-4',
      'col-9': 'w-9/12 px-4',
      'col-10': 'w-10/12 px-4',
      'col-11': 'w-11/12 px-4',
      'col-12': 'w-full px-4',

      // Display
      'd-none': 'hidden',
      'd-block': 'block',
      'd-inline': 'inline',
      'd-inline-block': 'inline-block',
      'd-flex': 'flex',
      'd-grid': 'grid',

      // Flexbox
      'flex-row': 'flex-row',
      'flex-column': 'flex-col',
      'justify-content-start': 'justify-start',
      'justify-content-end': 'justify-end',
      'justify-content-center': 'justify-center',
      'justify-content-between': 'justify-between',
      'justify-content-around': 'justify-around',
      'align-items-start': 'items-start',
      'align-items-end': 'items-end',
      'align-items-center': 'items-center',
      'align-items-stretch': 'items-stretch',

      // Spacing
      'm-0': 'm-0',
      'm-1': 'm-1',
      'm-2': 'm-2',
      'm-3': 'm-4',
      'm-4': 'm-6',
      'm-5': 'm-8',
      'p-0': 'p-0',
      'p-1': 'p-1',
      'p-2': 'p-2',
      'p-3': 'p-4',
      'p-4': 'p-6',
      'p-5': 'p-8',

      // Text
      'text-start': 'text-left',
      'text-center': 'text-center',
      'text-end': 'text-right',
      'text-primary': 'text-blue-600',
      'text-secondary': 'text-gray-600',
      'text-success': 'text-green-600',
      'text-danger': 'text-red-600',
      'text-warning': 'text-yellow-600',
      'text-info': 'text-cyan-600',
      'text-muted': 'text-gray-500',
      'fw-bold': 'font-bold',
      'fw-normal': 'font-normal',
      'fst-italic': 'italic',

      // Background
      'bg-primary': 'bg-blue-600',
      'bg-secondary': 'bg-gray-600',
      'bg-success': 'bg-green-600',
      'bg-danger': 'bg-red-600',
      'bg-warning': 'bg-yellow-400',
      'bg-info': 'bg-cyan-400',
      'bg-light': 'bg-gray-100',
      'bg-dark': 'bg-gray-800',
      'bg-white': 'bg-white',

      // Buttons
      'btn': 'px-4 py-2 font-medium rounded',
      'btn-primary': 'bg-blue-600 text-white hover:bg-blue-700',
      'btn-secondary': 'bg-gray-600 text-white hover:bg-gray-700',
      'btn-success': 'bg-green-600 text-white hover:bg-green-700',
      'btn-danger': 'bg-red-600 text-white hover:bg-red-700',
      'btn-warning': 'bg-yellow-400 text-black hover:bg-yellow-500',
      'btn-info': 'bg-cyan-400 text-black hover:bg-cyan-500',
      'btn-light': 'bg-gray-100 text-gray-800 hover:bg-gray-200',
      'btn-dark': 'bg-gray-800 text-white hover:bg-gray-900',
      'btn-outline-primary': 'border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white',
      'btn-sm': 'px-2 py-1 text-sm',
      'btn-lg': 'px-6 py-3 text-lg',

      // Border
      'border': 'border',
      'border-0': 'border-0',
      'border-top': 'border-t',
      'border-bottom': 'border-b',
      'border-start': 'border-l',
      'border-end': 'border-r',
      'rounded': 'rounded',
      'rounded-0': 'rounded-none',
      'rounded-1': 'rounded-sm',
      'rounded-2': 'rounded',
      'rounded-3': 'rounded-lg',
      'rounded-circle': 'rounded-full',
      'rounded-pill': 'rounded-full',

      // Shadow
      'shadow': 'shadow',
      'shadow-sm': 'shadow-sm',
      'shadow-lg': 'shadow-lg',
      'shadow-none': 'shadow-none',

      // Cards
      'card': 'bg-white rounded-lg shadow',
      'card-body': 'p-4',
      'card-title': 'text-lg font-semibold mb-2',
      'card-text': 'text-gray-700',
      'card-header': 'px-4 py-3 border-b bg-gray-50',
      'card-footer': 'px-4 py-3 border-t bg-gray-50',

      // Forms
      'form-control': 'w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
      'form-label': 'block mb-1 font-medium',
      'form-check': 'flex items-center',
      'form-check-input': 'mr-2',
      'input-group': 'flex',

      // Alerts
      'alert': 'p-4 rounded',
      'alert-primary': 'bg-blue-100 text-blue-800',
      'alert-secondary': 'bg-gray-100 text-gray-800',
      'alert-success': 'bg-green-100 text-green-800',
      'alert-danger': 'bg-red-100 text-red-800',
      'alert-warning': 'bg-yellow-100 text-yellow-800',
      'alert-info': 'bg-cyan-100 text-cyan-800',

      // Badges
      'badge': 'px-2 py-1 text-xs font-medium rounded',
      'badge-primary': 'bg-blue-600 text-white',
      'badge-secondary': 'bg-gray-600 text-white',

      // Utilities
      'w-100': 'w-full',
      'h-100': 'h-full',
      'overflow-auto': 'overflow-auto',
      'overflow-hidden': 'overflow-hidden',
      'position-relative': 'relative',
      'position-absolute': 'absolute',
      'position-fixed': 'fixed',
      'position-sticky': 'sticky',
    };

    const result: Record<string, string> = {};

    for (const cls of bootstrapClasses) {
      if (mapping[cls]) {
        result[cls] = mapping[cls];
      }
    }

    return result;
  }

  /**
   * Get all custom styles in a project
   */
  async getAllCustomStyles(projectPath: string): Promise<string[]> {
    const customStyles: string[] = [];

    const cssFiles = await findFiles('**/*.{css,scss,sass}', projectPath);

    for (const file of cssFiles) {
      // Skip vendor/node_modules
      if (file.includes('node_modules') || file.includes('vendor')) continue;

      try {
        const classes = await this.extractClasses(file);
        customStyles.push(...classes);
      } catch {
        // Continue
      }
    }

    return [...new Set(customStyles)];
  }
}
