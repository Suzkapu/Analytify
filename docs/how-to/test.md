# Testing requirements

These requirements are still being worked on.

- Use test-driven development: write tests before production code.
- Tests should cover everything.
- Use `cargo test` and use `dioxus-test` for some GUI tests.

## Test layers

- **Unit tests:** very fast; run on every build.
- **Integration tests:** run on every push.
- **System tests:** run on pull requests when trying to merge into main.
