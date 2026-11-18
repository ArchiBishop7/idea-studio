# Idea Studio

Idea Studio helps art and design students find a direction for a creative assignment. A student can start with a rough interest, connect two clue cards, and correct an interpretation. Those choices guide the next question and the project directions they can compare.

[Open Idea Studio](https://idea-studio-scad.vercel.app/)

## Run locally

Use Node.js 22 or later. The app uses Node's built-in modules and runs without installing packages.

    node server.mjs

Open http://127.0.0.1:4317. Preview mode uses sample responses. To generate live responses, set OPENAI_API_KEY on the server or in a local .env file and restart. OPENAI_MODEL can override the default model. Projects are saved in the browser. Use the backup controls to move a project between browsers.

## Follow a card through the code

1. The student drags a card onto another. [board.mjs](public/board.mjs) handles the gesture, and [connections.mjs](public/connections.mjs) finds cards linked together.
2. [app.mjs](public/app.mjs) handles the interface action. [state.mjs](public/state.mjs) updates the project and builds the context for the next turn.
3. [server.mjs](server.mjs) receives the request. [request-context.mjs](lib/request-context.mjs) prepares the project history, and [provider.mjs](lib/provider.mjs) generates and reviews the response.
4. The app checks the result against the current project before showing the next question. The student can keep exploring, compare directions, or export a choice.

## Run the tests

    node --test "test/*.test.mjs"

The automated suite covers project state, card connections, language support, HTTP routes, and error handling. The separate live scripts in test/ call the provider and use your API account.

## Deployment and licensing

Vercel runs [api/index.mjs](api/index.mjs) using [vercel.json](vercel.json). Configure the provider key as a server environment variable in your deployment.

Source code is available under the [MIT License](LICENSE). The bundled Caveat typeface has its own [SIL Open Font License](public/assets/OFL.txt).
