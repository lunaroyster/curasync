# curasync

This CLI tool helps you manage your cura configuration as a git repo. It is essentially a wrapper command around git that:

1. locates your cura configuration, .gitignores unnecessary files, and pushes them up to a blank repo (`curasync init <repo_url>`)
2. pushes your updated cura configuration up to the same repository with a commit message (`curasync push`)
3. lets someone clone your cura config (`curasync clone <repo_url>`)
4. lets them pull changes to the cura config (`curasync pull`)

Here's a guide to using `curasync`

## Installing curasync

You can install this globally using npm or the equivalent command in your package manager:

`npm i -g curasync`

You can also run it as an executable directly:

`npx curasync`

## Pushing your configuration to a blank repo:

⚠️ Warning: If you are logged into Cura, do not push your config to a public repo just yet (TODO: strip tokens)

1. The first thing you want to do is to set up a blank repository. Here's a handy link if you're using GitHub: https://github.com/new. Make sure to leave 'Add a README file' unchecked since we do not want to initialize the repository on GitHub
2. Now that you have a blank repo, invoke `curasync init <repo_url>`. This pushes up your configuration to the repo.
3. Now you can invite collaborators to the repo, and tell them to invoke `npx curasync clone <repo_url>` to grab your cura configuration. If they have write access, they will be able to push changes to the repo too.
4. If you make more changes, do run `curasync push`, which prompts you to enter a commit message and pushes your changes to the repo.

## Pulling a cura configuration

Note: we do not have a way to merge two configurations just yet. If someone sends you a repo url, this will back up your existing configuration, and clone their repo entirely

1. Let's assume someone sent you a repo url containing delicious printer configuration files. You want to make sure you have cura and curasync installed.
2. Now, enter `curasync clone <repo_url>`. This backs up your existing config, and fetches the new config from git
3. That's pretty much it, try opening cura now. You should see the newly fetched configuration
4. If new changes are published, make sure to run `curasync pull` to get them.
