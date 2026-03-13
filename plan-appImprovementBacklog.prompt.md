# App Improvement Backlog: CryptoPortfolio

This plan outlines tasks to improve stability, performance, and code quality for the CryptoPortfolio application.

## 1. Code Quality & Type Safety
- [ ] **Migrate to TypeScript**: The codebase is primarily JavaScript (`.js`). Gradually renaming files to `.ts` and `.tsx` and adding types will significantly reduce runtime errors and improve developer experience.
    - [ ] Add `tsconfig.json`.
    - [ ] Rename `src/components`, `src/screens`, `src/utils` files.
    - [ ] Fix type errors.
- [ ] **Dependency Audit**: `react-native` version is listed as `0.81.5` which seems unusual (stable is ~0.76). Verify and downgrade/upgrade to a stable version managed by Expo SDK (currently using Expo 54?).
    - [ ] Check `package.json` vs Expo SDK compatibility matrix.
    - [ ] Update dependencies.

## 2. Testing Strategy
- [ ] **Integration Tests**: Current tests rely heavily on mocking `node_modules` internals (`ViewConfig`, etc.). Introduce integration tests that render screens with fewer mocks.
    - [ ] Use `react-native-testing-library` more effectively.
    - [ ] Setup MSW (Mock Service Worker) for network requests instead of manual fetching mocks.
- [ ] **E2E Testing**: Add Maestro or Detox for end-to-end testing critical flows (Add Transaction, View Graph).
    - [ ] Setup Maestro flows.
    - [ ] Add CI job for E2E.

## 3. Performance Optimization
- [ ] **Graph Sampling**: The logs show `[PERF] Coin Chart (1D): 2ms (2 pts)`. A chart with only 2 points is just a line. Increase sampling resolution or make it adaptive based on screen width.
    - [ ] Investigate `src/utils/chartSampling.js`.
    - [ ] Adjust sampling algorithm to retain visual fidelity.
- [ ] **List Virtualization**: Ensure `FlatList` or `FlashList` (Shopify) is used for long lists of coins/transactions.

## 4. Error Handling & User Feedback
- [ ] **API Rate Limits**: `CryptoCompare` logs warnings to console. Implement user-facing feedback (Toast/Snackbar) when rate limits are hit or network fails.
    - [ ] Add a global error boundary or toast context.
    - [ ] Show retry button on graph error.
- [ ] **Form Validation**: Improve validation logic in `add-transaction.js` to prevent invalid entries before submission.

## 5. CI/CD Pipeline
- [ ] **Automated Versioning**: CI pipeline mentions tagging/versioning. Ensure `semantic-release` or similar is used to bump version numbers automatically on merge to main.
- [ ] **Linting & Formatting**: Ensure Prettier/ESLint runs on CI to enforce style consistency.

## 6. Cleanup
- [ ] **Remove unused mocks**: Review `src/__mocks__` directory. Some mocks might be redundant if we switch to better testing libraries or fix the underlying configuration issue properly (e.g. `ViewConfigIgnore` might be solvable via better jest preset config).

