# Rails Dev MCP Server

A self-learning MCP (Model Context Protocol) server for Rails + React + PostgreSQL development. This server provides guided workflows, code generation from templates, and learns from successful implementations to improve its library over time.

## Features

- **Workflow Engine**: Guides users through code generation with questions and options
- **Pattern Library**: Pre-built patterns for common Rails/React development tasks
- **Template Engine**: EJS-based templates with Rails/React convention helpers
- **Code Analysis**: Parse and analyze existing codebases to extract patterns
- **Learning Engine**: Learn from successful implementations to improve the library
- **PostgreSQL Integration**: Query and analyze your database directly

## Installation

```bash
npm install
npm run build
```

## Usage

### As an MCP Server

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "rails-dev": {
      "command": "node",
      "args": ["/path/to/rails-dev-mcp/dist/index.js"],
      "env": {
        "RAILS_MCP_LIBRARY": "/path/to/rails-dev-mcp/library"
      }
    }
  }
}
```

### Command Line Options

```bash
node dist/index.js --help

Options:
  --library <path>  Path to the library directory (default: ./library)
  --config <path>   Path to configuration file (default: ./config/default.yml)
  --help            Show help
```

### Environment Variables

- `RAILS_MCP_LIBRARY` - Library path
- `RAILS_MCP_CONFIG` - Config file path
- `RAILS_MCP_DB_HOST` - PostgreSQL host
- `RAILS_MCP_DB_PORT` - PostgreSQL port
- `RAILS_MCP_DB_USER` - PostgreSQL user
- `RAILS_MCP_DB_PASS` - PostgreSQL password
- `RAILS_MCP_DB_NAME` - PostgreSQL database

## Available Tools

### Workflow Tools
- `identify_intent` - Match user intent to patterns
- `start_workflow` - Begin a guided workflow
- `answer_workflow_step` - Answer workflow questions
- `execute_workflow` - Generate code from completed workflow
- `cancel_workflow` - Cancel active workflow

### Library Tools
- `search_library` - Search patterns, templates, snippets
- `get_pattern` - Get pattern definition
- `get_template` - Get template with content
- `get_snippet` - Get snippet with variable substitution
- `list_patterns` - List all patterns
- `list_templates` - List all templates
- `list_snippets` - List all snippets

### Analysis Tools
- `detect_project_context` - Analyze project structure
- `analyze_codebase` - Full codebase analysis
- `analyze_models` - Analyze Rails models
- `analyze_components` - Analyze React components
- `analyze_controllers` - Analyze Rails controllers
- `analyze_styles` - Analyze CSS/styling
- `batch_analyze` - Analyze multiple projects

### Learning Tools
- `analyze_implementation` - Propose new patterns from code
- `propose_contribution` - Submit new pattern/template/snippet
- `review_contributions` - List pending contributions
- `approve_contribution` - Approve and add to library
- `reject_contribution` - Reject contribution

### Database Tools
- `query_database` - Run SELECT queries
- `list_tables` - List database tables
- `describe_table` - Get table structure
- `analyze_query` - EXPLAIN ANALYZE
- `table_stats` - Get table statistics

### Generation Tools
- `generate_from_template` - Generate single file
- `generate_multiple` - Generate multiple files
- `generate_from_pattern` - Generate all pattern files
- `render_snippet` - Render snippet with variables

## Included Patterns

1. **crud-resource** - Full CRUD with model, controller, React components
2. **nested-resource** - Comments, replies, child resources
3. **user-authentication** - Login, signup, sessions
4. **file-upload** - Active Storage attachments
5. **search-filter** - Search and filtering
6. **pagination** - Paginated lists
7. **api-endpoint** - JSON API endpoints
8. **background-job** - Sidekiq/ActiveJob
9. **authorization** - Role-based permissions
10. **bootstrap-to-tailwind** - CSS migration

## Library Structure

```
library/
├── patterns/
│   ├── index.json
│   └── {pattern-id}/
│       └── manifest.json
├── templates/
│   ├── index.json
│   ├── {template-id}.json
│   └── {template-id}.ejs
├── snippets/
│   ├── index.json
│   └── {snippet-id}.json
└── learned/
    ├── pending_review/
    ├── approved/
    └── rejected/
```

## Extending the Library

### Adding a Pattern

Create a new directory under `library/patterns/` with a `manifest.json`:

```json
{
  "id": "my-pattern",
  "name": "My Pattern",
  "description": "Description of the pattern",
  "category": "full-stack",
  "triggers": ["keywords", "to match"],
  "workflow": {
    "id": "wf-my-pattern",
    "steps": [...]
  },
  "templates": ["template-ids"],
  "snippets": ["snippet-ids"],
  "instructions": ["Post-generation steps"],
  "version": "1.0.0",
  "tags": ["tags"]
}
```

### Adding a Template

Create JSON metadata and EJS template files:

```json
{
  "id": "my-template",
  "name": "My Template",
  "category": "model",
  "language": "ruby",
  "filePath": "templates/my-template.ejs",
  "outputPath": "app/models/<%= underscore(name) %>.rb",
  "variables": [
    {"name": "name", "type": "string", "required": true}
  ]
}
```

### Adding a Snippet

```json
{
  "id": "my-snippet",
  "name": "My Snippet",
  "category": "validation",
  "language": "ruby",
  "code": "validates {{field}}, presence: true",
  "variables": [
    {"name": "field", "description": "Field name"}
  ]
}
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test
```

## License

MIT
