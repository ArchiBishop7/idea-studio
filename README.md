# Idea Studio

Idea Studio helps art and design students find a direction for a creative assignment. A student can start with a rough interest, connect two clue cards, and correct an interpretation. Those choices guide the next question and the project directions they can compare.

[Open Idea Studio](https://idea-studio-scad.vercel.app/)

## What you need for live AI

**To run live AI on your own computer or deployment, you must supply your own OpenAI API key.** The repository includes the website and server code. The maintainer’s key is private. Live requests use the API account associated with the key on that server, including requests made by visitors to a shared deployment.

The [hosted demo](https://idea-studio-scad.vercel.app/) uses its own server configuration. Visitors do not enter a key. If you run your own copy without a key, you can still try the guided example in preview mode with sample responses. Generating live responses to your own input requires a working key and access to the configured model.

## Run locally

1. Install Node.js 22 or later and clone or download this repository. Open a terminal in the folder containing `server.mjs`. The app has no packages to install.
2. Create a plain text file named `.env` in that folder. Add the line below, replacing the placeholder with a key from your [OpenAI API account](https://platform.openai.com/api-keys). Keep this file on your computer. Git ignores it.

   ```dotenv
   OPENAI_API_KEY=replace_with_your_own_key
   ```

3. If your account needs a different model, add `OPENAI_MODEL` to the same file and set it to a compatible model ID your account can use.
4. Start the server:

   ```sh
   node server.mjs
   ```

5. Open http://127.0.0.1:4317 and use live mode. Restart the server after changing the key or model. Projects are saved in the browser. Use the backup controls to move a project between browsers.

## Deploy your own copy on Vercel

Import this repository into your Vercel account. In the project's environment variables, add `OPENAI_API_KEY` for Production. Add `OPENAI_MODEL` there if you use a model override. Deploy the project, or redeploy after changing the variables. To use live AI in a Vercel Preview deployment, configure the variables for the Preview environment as well.

The deployment uses [api/index.mjs](api/index.mjs) and [vercel.json](vercel.json). Keep the key on the server. Anyone using live AI on your public deployment uses your OpenAI API quota.

## Follow a card through the code

1. The student drags a card onto another. [board.mjs](public/board.mjs) handles the gesture, and [connections.mjs](public/connections.mjs) finds cards linked together.
2. [app.mjs](public/app.mjs) handles the interface action. [state.mjs](public/state.mjs) updates the project and builds the context for the next turn.
3. [server.mjs](server.mjs) receives the request. [request-context.mjs](lib/request-context.mjs) prepares the project history, and [provider.mjs](lib/provider.mjs) generates and reviews the response.
4. The app checks the result against the current project before showing the next question. The student can keep exploring, compare directions, or export a choice.

## Run the tests

    node --test "test/*.test.mjs"

The automated suite covers project state, card connections, language support, HTTP routes, and error handling. The separate live scripts in test/ call the provider and use your API account.

## License

Source code is available under the [MIT License](LICENSE). The bundled Caveat typeface has its own [SIL Open Font License](public/assets/OFL.txt).
