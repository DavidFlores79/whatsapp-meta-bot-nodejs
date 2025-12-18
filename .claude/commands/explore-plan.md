<user_request>
#$ARGUMENTS
<user_request>

At the end of this message, I will ask you to do something. Please follow the "Explore, Team Selection, Plan, Branch Strategy, Advice, Update, Clarification and Iterate" workflow when you start over the user_request.

# Create the session file
Create `.claude/sessions/context_session_{feature_name}.md` where plan is going to be updated with all the future iterations and feedback

# Explore
First, explore the relevant files in the repository to understand:
- Current project structure and technology stack
- Existing architectural patterns
- Dependencies and configurations
- Related existing features

# Team Selection (parallel execution if possible)
Select what subagents are going to be involved in the future advice phase based on the technology stack:
- **Backend**: Use `nodejs-backend-architect` for Node.js/Express backend development
- **Frontend**: Use `angular-frontend-developer` for Angular/TypeScript frontend development
- Don't invoke them yet, only let me know who you're going to ask advice from and for what specific aspects

# Plan
Write up a detailed implementation plan considering:
- Feature requirements and acceptance criteria
- Database schema changes (if needed)
- API endpoint design
- UI/UX components and user flows
- Testing strategy (unit, integration, e2e)
- Documentation requirements
- Performance considerations

If there are things you still do not understand or questions you have for the user, pause here to ask them before continuing.

# Branch Strategy
Plan the development workflow:
- **Branch Name**: Use conventional naming `feat/{feature-name-kebab-case}` based on the feature
- **Base Branch**: Ensure we're branching from `develop` (create if doesn't exist)
- **Target Branch**: All PRs will target `develop` branch
- **Review Requirements**: 1 reviewer required before merging

# Advice
Use in parallel the selected subagents to get knowledge and advice over the plan:
- Backend architect for API design, database schema, business logic
- Frontend developer for UI components, state management, user experience

If there are things you are not sure about, use parallel subagents to do some web research. They should only return useful information, no noise.

# Update
Update the context_session file with the final plan including:
- Complete implementation roadmap
- Branch strategy and naming
- Technology-specific architectural decisions
- File structure and component organization

# Clarification
Ask me questions about anything unclear giving the possible solutions in A) B) C) format to select:
- User scenarios and edge cases
- Integration requirements with existing systems
- Performance and scalability needs
- Technology stack preferences (if not clear from repo)
- Dependencies and third-party integrations

IMPORTANT: Wait for my answers before continuing.

# Iterate
Evaluate the plan and iterate over it until we have the final plan with the complete solution

# RULES
- The target of this session is to create the comprehensive plan DON'T implement it
- Always use conventional branch naming: `feat/{feature-name}`
- Target branch is always `develop`
- Consider the specific technology stack when selecting agents
- Plan must include proper testing and documentation strategies