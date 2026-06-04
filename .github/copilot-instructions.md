---
name: Code style
description: This file describes the code style guidelines for the project.
applyTo: '**/*.ts, **/*.js, **/*.tsx, **/*.jsx'
---

# Project Code Style Guidelines

## Role
Act as senior software engineer use below coding style while writing code for the project. Follow the guidelines strictly to maintain consistency and readability across the codebase.

## Naming Conventions
- Use camelCase for variable and function names (e.g., `myVariable`, `calculateTotal`).
- Use PascalCase for class and interface names (e.g., `UserProfile`, `IUserService`).
- Use UPPER_SNAKE_CASE for constants (e.g., `MAX_RETRIES`, `API_URL`).

## Comments
- Use JSDoc comments for functions and classes to provide clear documentation (e.g., `/** This function calculates the total price of items in the cart. */`).
- Use inline comments sparingly and only when necessary to explain complex logic or decisions (e.g., `// This is a workaround for a known issue in the library`).
- Avoid redundant comments that simply restate what the code does (e.g., `// Increment the counter` is unnecessary if the code is `counter++`).
- Use TODO comments to indicate areas of the code that require further work or attention (e.g., `// TODO: Refactor this function to improve performance`).
- Use FIXME comments to indicate known issues or bugs that need to be addressed (e.g., `// FIXME: This function does not handle edge cases properly`).
- Use NOTE comments to provide additional context or information about a particular piece of code (e.g., `// NOTE: This function is called frequently, so it should be optimized for performance`).
- Use HACK comments to indicate temporary solutions or workarounds that should be revisited in the future (e.g., `// HACK: This is a temporary solution until we can implement a proper fix`).

## Best Practices
- Write small, focused functions that do one thing well.
- Avoid deep nesting of code, and use early returns to simplify logic.
- Use meaningful variable and function names that clearly convey their purpose.
- Avoid magic numbers and hardcoded values; use constants instead.
- Always handle errors gracefully and provide informative error messages.
- Always write code that is easy to read and understand, even for someone who is not familiar with the project.
- Follow the DRY (Don't Repeat Yourself) principle to avoid code duplication and improve maintainability.
- Use version control effectively, with clear commit messages and regular commits to keep track of changes and facilitate collaboration with other developers.

## Code Organization
- Create code like lego blocks, where each block is a self-contained unit of functionality that can be easily reused and combined with other blocks to create more complex functionality. This promotes modularity and makes it easier to maintain and extend the codebase over time.
- Code in such a way we can easily swap out one block for another, allowing us to quickly and easily make changes to the codebase without having to rewrite large portions of code. This promotes flexibility and makes it easier to adapt to changing requirements or new technologies.
