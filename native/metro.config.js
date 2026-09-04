/* Metro only watches the app directory by default, but core/ deliberately lives
 * outside it — it is shared with the web build, and copying it into native/ would
 * recreate the duplication the shared module exists to prevent.
 *
 * So: watch the repository root, and keep module resolution pinned to native's own
 * node_modules so the root's dev dependencies (jsdom, playwright) stay out of the
 * bundle.
 */

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.resolve(repoRoot, "core")];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

// Import shared logic as "@core/util" from any depth. Relative paths to a sibling
// directory get miscounted the moment a file moves; an alias cannot.
//
// resolveRequest rather than extraNodeModules: the latter is consulted only after
// the default resolver has already failed to find a *package* by that name, which
// it never does for a bare "@core/..." specifier outside node_modules.
const CORE = path.resolve(repoRoot, "core");
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@core" || moduleName.startsWith("@core/")) {
    const rest = moduleName.slice("@core".length).replace(/^\//, "") || "index";
    return {
      type: "sourceFile",
      filePath: path.join(CORE, rest.endsWith(".js") ? rest : rest + ".js"),
    };
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
