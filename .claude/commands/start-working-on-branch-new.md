# Start Working on Branch

## Input
Branch name: $ARGUMENTS

## Setup Phase
1. **Validate Branch**: Ensure the specified branch exists and checkout
   ```bash
   git fetch origin
   git checkout $ARGUMENTS || echo "Branch $ARGUMENTS not found locally, checking remote..."
   git checkout -b $ARGUMENTS origin/$ARGUMENTS 2>/dev/null || echo "Using existing local branch"
   ```

2. **Load Session Context**: Find and load the related session file
   - Look for `.claude/sessions/context_session_*.md` files
   - Match branch name with session feature name
   - Load implementation plan and selected agents

3. **Verify Planning**: Confirm we have:
   - Technology agents selected (NestJS/Laravel/Angular/Flutter)
   - Detailed implementation plan
   - Architecture guidelines from session

## Implementation Phase
1. **Use Session Agents**: Execute using agents selected in explore-plan phase:
   - **NestJS Backend**: Use `nestjs-backend-architect` for Clean Architecture patterns
   - **Laravel Backend**: Use `laravel-backend-architect` for MVC and API patterns
   - **Angular Frontend**: Use `angular-frontend-developer` for reactive patterns  
   - **Flutter Frontend**: Use `flutter-frontend-developer` for mobile patterns

2. **Follow Test-Driven Development (TDD)**:
   - Write tests first (unit, integration, e2e as appropriate)
   - Run test suite constantly: `npm test`, `php artisan test`, `flutter test`
   - Implement feature code to make tests pass
   - Ensure >80% test coverage requirement

3. **Follow Session Plan**:
   - Execute the detailed implementation plan from session file
   - Implement Clean Architecture layers (Domain, Application, Infrastructure, Presentation)
   - Use SOLID principles and framework-specific patterns
   - Reference `backend-architecture-principles.md` for consistency

4. **Development Process**:
   - Commit changes with conventional commit messages: `git commit -m "feat: add user authentication"`
   - Push branch to remote: `git push origin $ARGUMENTS`
   - Create PR targeting develop branch or update existing one
   - Ensure all CI/CD checks pass
8. Report status of completeness:

<results>

  # Summary of the requirements implemented:
	- req 1
        - req 2
	- ...

  # Requirements pending
	- req 1
        - req 2
	- ...
  # Test implemented and their run status
     ok    github.com/gurusup/gurusup-backend/src/tests/domain/core/test_user_notification.py       31.604sm

  # Proof that all build passes
     ok    github.com/gurusup/gurusup-backend       90.604sm
  
  # Overall status: [Needs More Work/All Completed]
  # PR: github-pr-url
</result>

## PR Management Phase
1. Monitor PR status: `gh pr view $PR_NUMBER --json statusCheckRollup,state,mergeable,url`
2. Address any CI/CD failures or merge conflicts immediately
3. Respond to reviewer comments promptly using the `handle-pr-feedback` command
4. Ensure all status checks pass before requesting final review
5. PR targets `develop` branch and requires 1 approving review before merge

## Completion Criteria
- ✅ All requirements from the GitHub issue are implemented
- ✅ Unit tests are written and passing (>80% coverage)
- ✅ Integration tests cover main user flows  
- ✅ Code follows project architectural patterns and conventions
- ✅ Documentation is updated (README, API docs, component docs)
- ✅ All CI/CD checks pass (build, test, lint, security)
- ✅ PR has been reviewed and approved
- ✅ No merge conflicts with develop branch

## Important Notes
- **Conventional Branches**: Always use `feat/feature-name` format
- **Target Branch**: All PRs must target `develop`, never `main`
- **Review Required**: 1 reviewer approval needed before merge
- **Test Coverage**: Minimum 80% coverage required
- **Status**: "All Completed" only when ALL criteria above are met
- Use `handle-pr-feedback` command when reviewers request changes
- Always use `gh` CLI for GitHub operations
- Keep detailed records of all actions as PR/issue comments
- Wait for explicit confirmation before proceeding with major changes

## Final checks
- After create the PR review that the validations in the pipeline are success, if they are pending wait until they are success checking using `gh pr view {pr_number} --json statusCheckRollup,state,mergeable,url)` 
- If the validations are failed, review the issues or ask for them to me
- After have the issues, implement the fixes and push again to the PR until all the validations are success, continue in loop until have them all in green
- Once all is green, update the issue with a comment of what is implmented and your labour is finished