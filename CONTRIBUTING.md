# Contributing to WhatsApp Meta Bot

Thank you for considering contributing to this project! Please follow these guidelines.

## CRITICAL: Commit Message Policy

**STRICTLY PROHIBITED**: All forms of AI attribution in commit messages.

### Forbidden Content

Never include in commit messages:
- "Generated with Claude Code" or any AI tool references
- "Co-Authored-By: Claude Sonnet" or any AI assistant names
- AI-related emojis (🤖, 🦾, etc.)
- References to LLMs, AI assistance, code generation tools, or automation
- Any text, markers, or signatures indicating AI involvement

### Required Standard

All commits must appear as human-authored work without any AI acknowledgment or attribution.

## Development Guidelines

### Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure
4. Run development server: `npm run dev`

### Code Conventions

1. **Route Prefix**: Always use `/api/v2` for WhatsApp webhook routes
2. **Message Builders**: Return JSON strings, not objects
3. **Phone Numbers**: Use `formatNumber()` for Mexico-specific formatting
4. **Error Handling**: Catch all WhatsApp/OpenAI errors and send user-friendly messages
5. **Socket.io**: Use `req.io` for real-time event emissions
6. **Thread Management**: Never disable automatic thread cleanup logic

### Commit Message Format

Follow conventional commits:
```
feat: add user authentication
fix: resolve webhook verification issue
refactor: improve thread cleanup logic
docs: update API documentation
```

**NO AI attribution allowed** - See policy above.

### Testing

- Run thread optimization tests: `npm run test:threads`
- Test with WhatsApp Business API sandbox
- Verify Socket.io events in browser console

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following code conventions
3. Test thoroughly with actual WhatsApp webhooks
4. Commit with clean, human-authored messages (no AI attribution)
5. Submit PR with clear description of changes
6. Address review comments

### Code Review Checklist

- [ ] No breaking changes to `/api/v2` routes
- [ ] Message builders still return JSON strings
- [ ] Socket.io middleware intact
- [ ] Phone formatting logic preserved
- [ ] Thread cleanup still functional
- [ ] Commit messages contain NO AI attribution
- [ ] All tests passing

## Questions?

Open an issue for questions about:
- WhatsApp Cloud API integration
- OpenAI Assistant configuration
- Thread management system
- Socket.io implementation

Thank you for contributing!
