# cubejs 1.3.2

From the MIT-licensed npm release https://github.com/ldez/cubejs.
Only lib/cube.js and lib/solve.js are used. Their generated JavaScript is joined
in index.js with an ES module wrapper. The outer IIFEs bind to a local cubeModule
object; CommonJS/global export handling becomes a default export. Algorithms and
tables are unchanged. LICENSE and its complete header are retained. A public
solver-licenses.txt is also distributed and precached.

Vendoring these 51 kB avoids cubejs's unrelated npm runtime dependency (which
pulls in an entire obsolete package manager). No third-party runtime dependencies
were added to package.json. Cubejs is imported only by the Web Worker and tests.
