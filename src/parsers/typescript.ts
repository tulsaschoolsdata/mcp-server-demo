import {
  ComponentInfo,
  HookInfo,
  PropInfo,
} from '../types.js';
import { readFile, findFiles, camelize } from '../utils/helpers.js';
import * as path from 'path';

/**
 * TypeScript/React code parser
 * Uses regex-based parsing for reliability without native dependencies
 */
export class TypeScriptParser {
  /**
   * Parse a React component file
   */
  async parseComponent(filePath: string): Promise<ComponentInfo | null> {
    try {
      const content = await readFile(filePath);
      return this.parseComponentContent(content, filePath);
    } catch {
      return null;
    }
  }

  /**
   * Parse component content
   */
  parseComponentContent(content: string, filePath: string): ComponentInfo | null {
    // Try to find functional component
    const funcComponent = this.parseFunctionalComponent(content, filePath);
    if (funcComponent) return funcComponent;

    // Try to find class component
    const classComponent = this.parseClassComponent(content, filePath);
    if (classComponent) return classComponent;

    return null;
  }

  /**
   * Parse functional component
   */
  private parseFunctionalComponent(
    content: string,
    filePath: string
  ): ComponentInfo | null {
    // Match various functional component patterns
    const patterns = [
      // export function ComponentName
      /export\s+(?:default\s+)?function\s+(\w+)\s*\(/,
      // export const ComponentName = (
      /export\s+(?:default\s+)?const\s+(\w+)\s*[=:]\s*(?:\([^)]*\)|[^=])*=>\s*[({]/,
      // const ComponentName: React.FC
      /(?:export\s+)?const\s+(\w+)\s*:\s*(?:React\.)?(?:FC|FunctionComponent)/,
      // function ComponentName (at top level)
      /^function\s+(\w+)\s*\(/m,
    ];

    let name: string | null = null;

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && /^[A-Z]/.test(match[1])) {
        name = match[1];
        break;
      }
    }

    if (!name) return null;

    return {
      name,
      filePath,
      type: 'functional',
      props: this.extractProps(content, name),
      hooks: this.extractHooks(content),
      cssClasses: this.extractCssClasses(content),
    };
  }

  /**
   * Parse class component
   */
  private parseClassComponent(
    content: string,
    filePath: string
  ): ComponentInfo | null {
    const classMatch = content.match(
      /(?:export\s+)?(?:default\s+)?class\s+(\w+)\s+extends\s+(?:React\.)?(?:Component|PureComponent)/
    );

    if (!classMatch) return null;

    const name = classMatch[1];

    return {
      name,
      filePath,
      type: 'class',
      props: this.extractProps(content, name),
      hooks: [], // Class components don't use hooks
      cssClasses: this.extractCssClasses(content),
    };
  }

  /**
   * Extract props from component
   */
  private extractProps(content: string, componentName: string): PropInfo[] {
    const props: PropInfo[] = [];

    // Look for interface or type definition for props
    const propsTypePatterns = [
      new RegExp(`interface\\s+${componentName}Props\\s*\\{([^}]+)\\}`),
      new RegExp(`type\\s+${componentName}Props\\s*=\\s*\\{([^}]+)\\}`),
      /interface\s+Props\s*\{([^}]+)\}/,
      /type\s+Props\s*=\s*\{([^}]+)\}/,
    ];

    let propsContent: string | null = null;

    for (const pattern of propsTypePatterns) {
      const match = content.match(pattern);
      if (match) {
        propsContent = match[1];
        break;
      }
    }

    if (propsContent) {
      // Parse prop definitions
      const propRegex = /(\w+)(\?)?:\s*([^;,\n]+)/g;
      let match;

      while ((match = propRegex.exec(propsContent)) !== null) {
        const propName = match[1];
        const optional = !!match[2];
        const type = match[3].trim();

        // Skip common non-props
        if (['children', 'className', 'style'].includes(propName)) continue;

        props.push({
          name: propName,
          type,
          required: !optional,
        });
      }
    }

    // Also look for destructured props in function signature
    const destructuredMatch = content.match(
      new RegExp(`function\\s+${componentName}\\s*\\(\\s*\\{([^}]+)\\}`)
    );

    if (destructuredMatch && props.length === 0) {
      const destructured = destructuredMatch[1];
      const propNames = destructured.split(',').map((p) => p.trim().split('=')[0].trim());

      for (const propName of propNames) {
        if (propName && !['children', 'className', 'style'].includes(propName)) {
          props.push({
            name: propName,
            required: true, // Can't determine from destructuring
          });
        }
      }
    }

    return props;
  }

  /**
   * Extract React hooks used in component
   */
  private extractHooks(content: string): string[] {
    const hooks: string[] = [];
    const hookSet = new Set<string>();

    // Match built-in hooks
    const builtInHooks = [
      'useState',
      'useEffect',
      'useContext',
      'useReducer',
      'useCallback',
      'useMemo',
      'useRef',
      'useImperativeHandle',
      'useLayoutEffect',
      'useDebugValue',
      'useDeferredValue',
      'useTransition',
      'useId',
      'useSyncExternalStore',
      'useInsertionEffect',
    ];

    for (const hook of builtInHooks) {
      if (content.includes(`${hook}(`)) {
        hookSet.add(hook);
      }
    }

    // Match custom hooks (useXxx pattern)
    const customHookRegex = /\buse[A-Z]\w+/g;
    let match;

    while ((match = customHookRegex.exec(content)) !== null) {
      hookSet.add(match[0]);
    }

    return Array.from(hookSet);
  }

  /**
   * Extract CSS classes used in component
   */
  private extractCssClasses(content: string): string[] {
    const classes = new Set<string>();

    // Match className="..." or className='...'
    const staticClassRegex = /className\s*=\s*["']([^"']+)["']/g;
    let match;

    while ((match = staticClassRegex.exec(content)) !== null) {
      const classStr = match[1];
      classStr.split(/\s+/).forEach((c) => {
        if (c) classes.add(c);
      });
    }

    // Match className={...} with template literals
    const templateRegex = /className\s*=\s*\{`([^`]+)`\}/g;
    while ((match = templateRegex.exec(content)) !== null) {
      const classStr = match[1];
      // Extract static parts of template
      const staticParts = classStr.replace(/\$\{[^}]+\}/g, '');
      staticParts.split(/\s+/).forEach((c) => {
        if (c) classes.add(c);
      });
    }

    return Array.from(classes);
  }

  /**
   * Parse a custom hook file
   */
  async parseHook(filePath: string): Promise<HookInfo | null> {
    try {
      const content = await readFile(filePath);
      return this.parseHookContent(content, filePath);
    } catch {
      return null;
    }
  }

  /**
   * Parse hook content
   */
  parseHookContent(content: string, filePath: string): HookInfo | null {
    // Match hook definition
    const hookMatch = content.match(
      /(?:export\s+)?(?:function|const)\s+(use[A-Z]\w+)/
    );

    if (!hookMatch) return null;

    const name = hookMatch[1];

    return {
      name,
      filePath,
      dependencies: this.extractHookDependencies(content),
      returnType: this.extractReturnType(content, name),
    };
  }

  /**
   * Extract dependencies used in a hook
   */
  private extractHookDependencies(content: string): string[] {
    const deps = new Set<string>();

    // Look for imported hooks
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]react['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const imports = match[1].split(',').map((i) => i.trim());
      imports.forEach((i) => {
        if (i.startsWith('use')) {
          deps.add(i);
        }
      });
    }

    // Look for other hook imports
    const hookImportRegex = /import\s*\{?\s*(use\w+)\s*\}?\s*from/g;
    while ((match = hookImportRegex.exec(content)) !== null) {
      deps.add(match[1]);
    }

    return Array.from(deps);
  }

  /**
   * Extract return type from hook
   */
  private extractReturnType(content: string, hookName: string): string | undefined {
    // Look for explicit return type
    const typeMatch = content.match(
      new RegExp(`function\\s+${hookName}[^:]*:\\s*([^{]+)`)
    );

    if (typeMatch) {
      return typeMatch[1].trim();
    }

    // Try to infer from return statement
    const returnMatch = content.match(/return\s+([^;]+)/);
    if (returnMatch) {
      const returnVal = returnMatch[1].trim();
      if (returnVal.startsWith('[')) {
        return 'tuple';
      }
      if (returnVal.startsWith('{')) {
        return 'object';
      }
    }

    return undefined;
  }

  /**
   * Parse all components in a directory
   */
  async parseAllComponents(projectPath: string): Promise<ComponentInfo[]> {
    const patterns = [
      'app/javascript/components/**/*.tsx',
      'app/javascript/components/**/*.jsx',
      'src/components/**/*.tsx',
      'src/components/**/*.jsx',
      'frontend/components/**/*.tsx',
      'frontend/components/**/*.jsx',
    ];

    const components: ComponentInfo[] = [];
    const seenNames = new Set<string>();

    for (const pattern of patterns) {
      const files = await findFiles(pattern, projectPath);

      for (const file of files) {
        // Skip test files
        if (file.includes('.test.') || file.includes('.spec.')) continue;

        const component = await this.parseComponent(file);
        if (component && !seenNames.has(component.name)) {
          components.push(component);
          seenNames.add(component.name);
        }
      }
    }

    return components;
  }

  /**
   * Parse all hooks in a directory
   */
  async parseAllHooks(projectPath: string): Promise<HookInfo[]> {
    const patterns = [
      'app/javascript/hooks/**/*.ts',
      'app/javascript/hooks/**/*.tsx',
      'src/hooks/**/*.ts',
      'src/hooks/**/*.tsx',
      'frontend/hooks/**/*.ts',
    ];

    const hooks: HookInfo[] = [];
    const seenNames = new Set<string>();

    for (const pattern of patterns) {
      const files = await findFiles(pattern, projectPath);

      for (const file of files) {
        if (file.includes('.test.') || file.includes('.spec.')) continue;

        const hook = await this.parseHook(file);
        if (hook && !seenNames.has(hook.name)) {
          hooks.push(hook);
          seenNames.add(hook.name);
        }
      }
    }

    return hooks;
  }

  /**
   * Extract React version from package.json
   */
  async extractReactVersion(projectPath: string): Promise<string | undefined> {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const content = await readFile(pkgPath);
      const pkg = JSON.parse(content);

      return (
        pkg.dependencies?.react ||
        pkg.devDependencies?.react ||
        pkg.peerDependencies?.react
      );
    } catch {
      return undefined;
    }
  }

  /**
   * Extract TypeScript version from package.json
   */
  async extractTypeScriptVersion(projectPath: string): Promise<string | undefined> {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const content = await readFile(pkgPath);
      const pkg = JSON.parse(content);

      return pkg.dependencies?.typescript || pkg.devDependencies?.typescript;
    } catch {
      return undefined;
    }
  }

  /**
   * Detect bundler being used
   */
  async detectBundler(
    projectPath: string
  ): Promise<'webpack' | 'vite' | 'esbuild' | 'importmap' | 'unknown'> {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const content = await readFile(pkgPath);
      const pkg = JSON.parse(content);

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      if (allDeps.vite) return 'vite';
      if (allDeps.esbuild || allDeps['esbuild-loader']) return 'esbuild';
      if (allDeps.webpack || allDeps['webpack-cli']) return 'webpack';

      // Check for Rails importmap
      const gemfilePath = path.join(projectPath, 'Gemfile');
      const gemfile = await readFile(gemfilePath);
      if (gemfile.includes('importmap-rails')) return 'importmap';

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extract imports from a TypeScript file
   */
  extractImports(content: string): { module: string; imports: string[] }[] {
    const results: { module: string; imports: string[] }[] = [];

    // Named imports
    const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = namedImportRegex.exec(content)) !== null) {
      const imports = match[1].split(',').map((i) => i.trim().split(' as ')[0]);
      results.push({
        module: match[2],
        imports,
      });
    }

    // Default imports
    const defaultImportRegex = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
    while ((match = defaultImportRegex.exec(content)) !== null) {
      results.push({
        module: match[2],
        imports: [match[1]],
      });
    }

    return results;
  }

  /**
   * Extract exports from a TypeScript file
   */
  extractExports(content: string): string[] {
    const exports: string[] = [];

    // Named exports
    const namedExportRegex = /export\s+(?:const|function|class|interface|type)\s+(\w+)/g;
    let match;

    while ((match = namedExportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // Export from
    const exportFromRegex = /export\s*\{([^}]+)\}/g;
    while ((match = exportFromRegex.exec(content)) !== null) {
      const names = match[1].split(',').map((n) => n.trim().split(' as ')[0]);
      exports.push(...names);
    }

    // Default export
    if (content.match(/export\s+default/)) {
      const defaultMatch = content.match(/export\s+default\s+(?:class|function)?\s*(\w+)/);
      if (defaultMatch) {
        exports.push(`default:${defaultMatch[1]}`);
      }
    }

    return exports;
  }
}
