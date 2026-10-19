// Generated manifests live on their own branch. Never update the source branch.
module.exports = async function publishDeployment({ github, context, core }) {
  if (context.ref !== "refs/heads/master") {
    throw new Error("Releases must come from master");
  }
  const { owner, repo } = context.repo;
  const branch = "deployments";
  const path = "deploy/app/kustomization.yaml";
  const { data: source } = await github.rest.git.getTree({
    owner,
    repo,
    tree_sha: context.sha,
    recursive: "true",
  });
  if (source.truncated) throw new Error("Source tree is incomplete");
  const entries = source.tree
    .filter(
      (entry) => entry.type === "blob" && entry.path.startsWith("deploy/app/"),
    )
    .map(({ path, mode, type, sha }) => ({ path, mode, type, sha }));
  if (!entries.some((entry) => entry.path === path)) {
    throw new Error("Deployment kustomization is missing");
  }
  const { data: manifest } = await github.rest.repos.getContent({
    owner,
    repo,
    path,
    ref: context.sha,
  });
  const previous = Buffer.from(manifest.content, "base64").toString("utf8");
  const tags = /^[ \t]*newTag: [^\r\n]+/gm;
  if ((previous.match(tags) || []).length !== 2) {
    throw new Error("Expected two image references");
  }
  const content = previous.replace(
    /^([ \t]*newTag: )[^\r\n]+/gm,
    "$1" + context.sha,
  );
  const tree = entries.map((entry) =>
    entry.path === path
      ? { path, mode: entry.mode, type: "blob", content }
      : entry,
  );
  // No base_tree: every release is a complete manifest snapshot. Deleted source
  // manifests disappear too. Workflows and application code are never copied.
  const { data: snapshot } = await github.rest.git.createTree({
    owner,
    repo,
    tree,
  });
  let parent;
  try {
    const { data: ref } = await github.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    parent = ref.object.sha;
    const { data: head } = await github.rest.git.getCommit({
      owner,
      repo,
      commit_sha: parent,
    });
    if (head.tree.sha === snapshot.sha) {
      core.notice("Deployment already published");
      return parent;
    }
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const { data: commit } = await github.rest.git.createCommit({
    owner,
    repo,
    message: `chore(deploy): release ${context.sha.slice(0, 7)}`,
    tree: snapshot.sha,
    parents: parent ? [parent] : [],
  });
  if (parent) {
    // A concurrent branch edit fails safely rather than overwriting its history.
    await github.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.sha,
      force: false,
    });
  } else {
    await github.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: commit.sha,
    });
  }
  core.notice(`Published ${context.sha} to ${branch}`);
  return commit.sha;
};
