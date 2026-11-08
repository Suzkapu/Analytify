# Testing requirements

These requirements are still being worked on.

- Use test-driven development: write tests before production code.
- Tests should cover everything.
- Use `cargo test` and use `dioxus-test` for some GUI tests.

- Use GitHub Actions to run tests and build public-project releases, including Apple builds on macOS runners. Apple signing and distribution still need setup.
- Choose a browser automation tool for Chrome, Firefox, and Safari-related coverage.
- Test keyboard, screen reader, and touch accessibility. The testing tools are not chosen yet.
- Test notification permission denial and revocation, token rotation, duplicate delivery, offline devices, notification clicks, and multiple devices.
- Plan and test Android and iOS packages, Windows and macOS builds, and Linux AppImage and Flatpak builds for the required architectures.

## Test layers

- **Unit tests:** very fast; run on every build.
- **Integration tests:** run on every push.
- **System tests:** run on pull requests when trying to merge into main.
