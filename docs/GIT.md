# Git & Release Workflow

This project uses an automated multi-registry release pipeline powered by **Changesets** and **GitHub Actions**. We publish to **NPM**, **JSR**, and **GitHub Releases** simultaneously with synchronized versioning.

---

## 🚀 Release Lifecycle

### 1. Local Development
After completing your code changes, you must document the impact of your changes using a "changeset".

1.  **Work on a Feature Branch**:
    ```bash
    git checkout -b feature/your-feature-name
    ```
2.  **Generate a Changeset**:
    After completing your changes:
    ```bash
    bunx changeset
    ```
    *   **Select semver type**: Choose `patch` (bug fixes), `minor` (features), or `major` (breaking changes).
    *   **Description**: Write a concise summary of what was changed.
3.  **Commit and Push to Branch**:
    ```bash
    git add .
    git commit -m "feat: your feature description"
    git push origin feature/your-feature-name
    ```
4.  **Open and Merge Pull Request**:
    Create a PR on GitHub from your feature branch to `main`. Once merged, the automation kicks in.

### 2. Versioning (Automated PR)
Once your changes reach the `main` branch, the **Release Orchestrator** workflow detects the new changeset files.

*   **Action**: A "Version Packages" Pull Request is automatically opened by the GitHub Actions bot.
*   **Contents**: This PR includes the version bump in `package.json` and the auto-generated entries in `CHANGELOG.md`.
*   **Your Task**: **Merge** this PR into `main` to trigger the actual release.

### 3. Tagging & Orchestration
Upon merging the versioning PR:
1.  The Orchestrator creates a **Git Tag** (e.g., `v0.1.2`).
2.  A **GitHub Release** is generated using the changelog notes.
3.  The new Tag triggers the specialized publishing workflows.

### 4. Registry Distribution (Parallel)
The creation of the Git tag triggers two independent pipelines:

#### **A. NPM Registry (`release.npm.yml`)**
*   Builds the production assets (`dist/`).
*   Publishes the package to **NPM** using the configured `NPM_TOKEN`.

#### **B. JSR Registry (`release.jsr.yml`)**
*   **Version Sync**: Automatically copies the version from `package.json` to `jsr.json`.
*   **OIDC Auth**: Authenticates with [jsr.io](https://jsr.io) using GitHub's tokenless OIDC provider.
*   **Publish**: Publishes the TypeScript source directly to **JSR**.

---

## 🛠 Required GitHub Setup

To ensure this workflow functions correctly, the following must be configured in the repository:

### 1. Permissions
*   Go to **Settings > Actions > General**.
*   Set **Workflow permissions** to `Read and write permissions`.
*   Check **Allow GitHub Actions to create and approve pull requests**.

### 2. Secrets
Add these to **Settings > Secrets and variables > Actions**:
*   `NPM_TOKEN`: Your NPM automation token.
*   `RELEASE_PAT`: A Personal Access Token (Classic) with `repo` and `workflow` scopes. This is required to allow the Orchestrator to trigger the NPM/JSR workflows.

### 3. JSR Trust
*   Log in to [jsr.io](https://jsr.io).
*   Go to your package **Settings > Publishing**.
*   Link your GitHub repository (e.g., `fajarnugraha37/drizzle-castor`) under the **GitHub Actions** section.

---

## 💡 Summary of Workflows

| Workflow | Trigger | Responsibility |
| :--- | :--- | :--- |
| **CI** | Push/PR | Unit Tests, Build, Type Check. |
| **Manual Integration** | Manual | Heavy DB tests (Postgres, MySQL, SQLite). |
| **Release Orchestrator** | Push to `main` | Changeset PRs, Git Tagging, GH Releases. |
| **Release to NPM** | New Tag (`v*`) | Build and Publish to NPM. |
| **Release to JSR** | New Tag (`v*`) | Sync `jsr.json` and Publish to JSR. |
