# Repository guidance

Use the project-local `$visual-workbench-video` skill when the user asks to analyze recorded videos, generate a rough cut, import a confirmed plan, or export a project.

Never modify files under `input/videos/`. A rough-cut plan must be shown to the user and explicitly confirmed before writing any ProjectDocument.

When the user has just cloned this repository, inspect the local runtime first. Explain the two supported paths in plain language: direct homepage video import, or Codex-assisted rough cut through `input/videos/`. Do not require the user to install this skill globally.

Community projects live under `public/projects/<project-id>/`. Generated plans live under `workbench-output/plans/`. Final renders live under `exports/`.

Before handing off code changes, run `pnpm check`. For project export, run `pnpm render:project -- "<project-name-or-id>"` and report the exact output path.
