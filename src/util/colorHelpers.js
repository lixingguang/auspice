import { rgb } from "d3-color";
import { mean } from "d3-array";
import { interpolateRgb } from "d3-interpolate";
import { scalePow } from "d3-scale";

/**
* Takes an array of color hex strings.
* Returns a color hex string representing the average of the array.
* @param {Array} colors - array of hex strings
*/
export const averageColors = (hexColors) => {
  const colors = hexColors.map((hex) => rgb(hex));
  const reds = colors.map((col) => col.r);
  const greens = colors.map((col) => col.g);
  const blues = colors.map((col) => col.b);
  const avg = rgb(mean(reds), mean(greens), mean(blues));
  return avg.toString();
};

export const determineColorByGenotypeType = (colorBy) => {
  /* note that nucleotide genotypes are either gt-nucXXX or gt-XXX */
  if (colorBy.startsWith("gt")) {
    if (colorBy.slice(3, 6) === "nuc") {
      return "nuc";
    }
    return "aa";
  }
  return false;
};

/**
* what values (for colorBy) are present in the tree and not in the color_map?
* @param {Array} nodes - list of nodes
* @param {Array|undefined} nodesToo - list of nodes for the second tree
* @param {string} colorBy -
* @param {Array} color_map - list of colorBy values with colours
* @return {list}
*/
export const getExtraVals = (nodes, nodesToo, colorBy, color_map) => {
  let valsInTree = [];
  nodes.forEach((n) => valsInTree.push(n.attr[colorBy]));
  if (nodesToo) nodesToo.forEach((n) => valsInTree.push(n.attr[colorBy]));
  valsInTree = [...new Set(valsInTree)];
  const valsInMeta = color_map.map((d) => { return d[0];});
  // console.log("here", valsInMeta, valsInTree, valsInTree.filter((x) => valsInMeta.indexOf(x) === -1))
  // only care about values in tree NOT in metadata
  return valsInTree.filter((x) => valsInMeta.indexOf(x) === -1);
};


/* a getter for the value of the colour attribute of the node provided for the currently set colour
note this is not the colour HEX */
export const getTipColorAttribute = (node, colorScale) => {
  if (colorScale.colorBy.slice(0, 3) === "gt-" && colorScale.genotype) {
    return node.currentGt;
  }
  return node.attr[colorScale.colorBy];
};

/* generates and returns an array of colours (HEXs) for the nodes under the given colorScale */
/* takes around 2ms on a 2000 tip tree */
export const calcNodeColor = (tree, colorScale) => {
  if (tree && tree.nodes && colorScale && colorScale.colorBy) {
    const nodeColorAttr = tree.nodes.map((n) => getTipColorAttribute(n, colorScale));
    // console.log(nodeColorAttr.map((n) => colorScale.scale(n)))
    return nodeColorAttr.map((n) => colorScale.scale(n));
  }
  return null;
};


const branchInterpolateColour = "#BBB";
const branchOpacityConstant = 0.6;
const branchOpacityLowerBound = 0.4;
export const branchOpacityFunction = scalePow()
  .exponent([0.3])
  .domain([0, 1])
  .range([branchOpacityLowerBound, 1])
  .clamp(true);
// entropy calculation precomputed in augur
// export const calcEntropyOfValues = (vals) =>
//   vals.map((v) => v * Math.log(v + 1E-10)).reduce((a, b) => a + b, 0) * -1 / Math.log(vals.length);

/**
 * calculate array of HEXs to actually be displayed.
 * (colorBy) confidences manifest as opacity ramps
 * @param {obj} tree phyloTree object
 * @param {bool} confidence enabled?
 * @return {array} array of hex's. 1-1 with nodes.
 */
export const calcBranchStrokeCols = (tree, confidence, colorBy) => {
  if (confidence === true) {
    return tree.nodeColors.map((col, idx) => {
      const entropy = tree.nodes[idx].attr[colorBy + "_entropy"];
      return rgb(interpolateRgb(col, branchInterpolateColour)(branchOpacityFunction(entropy))).toString();
    });
  }
  return tree.nodeColors.map((col) => {
    return rgb(interpolateRgb(col, branchInterpolateColour)(branchOpacityConstant)).toString();
  });
};
