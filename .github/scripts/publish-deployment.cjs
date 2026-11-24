// Generated manifests live on their own branch. Never update the source branch.
const { validateImages, validateTables, renderImages } = require("./release-images.cjs");
module.exports = async function publishDeployment({ github, context, core, tested }) {
  if (context.ref !== "refs/heads/master") {
    throw new Error("Releases must come from master");
  }
  const { owner, repo } = context.repo;
  if (tested?.schema !== 1 || tested.source !== context.sha)
    throw new Error("Missing tested image selection for this source commit");
  validateImages(tested.images);
  validateTables(tested.tables);
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
  const content = renderImages(previous, tested.images);
  const tree = entries.map((entry) =>
    entry.path === path
      ? { path, mode: entry.mode, type: "blob", content }
      : entry,
  );
  tree.push({path: "deploy/release.json", mode: "100644", type: "blob",
    content: JSON.stringify({schema: 1, source: context.sha, images: tested.images,
      tables: tested.tables ?? null}, null, 2) + "\n"});
  let parent;
  try {
    const { data: ref } = await github.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    parent = ref.object.sha;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if ((parent ?? null) !== tested.baseline)
    throw new Error("Deployment changed after image selection; rerun against the new baseline");
  // No base_tree: deleted source manifests disappear too. Only deployment
  // manifests and their exact tested image record are published.
  const { data: snapshot } = await github.rest.git.createTree({ owner, repo, tree });
  if (parent) {
    const { data: head } = await github.rest.git.getCommit({owner, repo, commit_sha: parent});
    if (head.tree.sha === snapshot.sha) {
      core.notice("Deployment already published");
      return parent;
    }
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
