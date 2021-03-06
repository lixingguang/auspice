/* eslint no-restricted-syntax: 0 */
import React from "react";
import { infoNotification, warningNotification } from "../../actions/notifications";
import { prettyString, formatURLString, authorString } from "../../util/stringHelpers";

export const isPaperURLValid = (d) => {
  return (
    Object.prototype.hasOwnProperty.call(d, "paper_url") &&
    !d.paper_url.endsWith('/') &&
    d.paper_url !== "?"
  );
};

export const getAuthor = (info, k) => {
  if (info === undefined || k === undefined) {
    return (
      <span>Not Available</span>
    );
  }
  // TODO: improve this block
  // if (isPaperURLValid(info[k])) {
  //   return (
  //     <a href={formatURLString(info[k].paper_url)} target="_blank">
  //       {authorString(k)}
  //     </a>
  //   );
  // }
  return authorString(k);
};

/* this function based on https://github.com/daviddao/biojs-io-newick/blob/master/src/newick.js */
const treeToNewick = (root, temporal) => {
  function recurse(node, parentX) {
    let subtree = "";
    if (node.hasChildren) {
      const children = [];
      node.children.forEach((child) => {
        const subsubtree = recurse(child, temporal ? node.attr.num_date : node.attr.div);
        children.push(subsubtree);
      });
      subtree += "(" + children.join(",") + ")" + node.strain + ":";
      subtree += (temporal ? node.attr.num_date : node.attr.div) - parentX;
    } else { /* terminal node */
      let leaf = node.strain + ":";
      leaf += (temporal ? node.attr.num_date : node.attr.div) - parentX;
      subtree += leaf;
    }
    return subtree;
  }
  return recurse(root, 0) + ";";
};

const MIME = {
  text: "text/plain;charset=utf-8;",
  csv: 'text/csv;charset=utf-8;',
  tsv: `text/tab-separated-values;charset=utf-8;`,
  svg: "image/svg+xml;charset=utf-8"
};


const write = (filename, type, content) => {
  /* https://stackoverflow.com/questions/18848860/javascript-array-to-csv/18849208#comment59677504_18849208 */
  const blob = new Blob([content], { type: type });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const authorTSV = (dispatch, filePrefix, metadata, tree) => {
  const lineArray = [["Author", "n (strains)", "publication title", "journal", "publication URL", "strains"].join("\t")];
  const filename = filePrefix + "_authors.tsv";

  const authors = {};
  tree.nodes.filter((n) => !n.hasChildren && n.attr.authors).forEach((n) => {
    if (!authors[n.attr.authors]) {
      authors[n.attr.authors] = [n.strain];
    } else {
      authors[n.attr.authors].push(n.strain);
    }
  });
  const body = [];
  if (metadata.author_info) {
    for (const author of Object.keys(metadata.author_info)) {
      body.push([
        prettyString(author, {camelCase: false}),
        metadata.author_info[author].n,
        prettyString(metadata.author_info[author].title, {removeComma: true}),
        prettyString(metadata.author_info[author].journal, {removeComma: true}),
        isPaperURLValid(metadata.author_info[author]) ? formatURLString(metadata.author_info[author].paper_url) : "unknown",
        authors[author].join(",")
      ]);
    }
  }

  body.forEach((line) => { lineArray.push(line.join("\t")); });
  write(filename, MIME.tsv, lineArray.join("\n"));
  dispatch(infoNotification({message: "Author metadata exported", details: filename}));
};

export const turnAttrsIntoHeaderArray = (attrs) => {
  return ["Strain"].concat(attrs.map((v) => prettyString(v)));
};

export const strainTSV = (dispatch, filePrefix, nodes, rawAttrs) => {
  // dont need to traverse the tree - can just loop the nodes
  const filename = filePrefix + "_metadata.tsv";
  const data = [];
  const includeAttr = (v) => (!(v.includes("entropy") || v.includes("confidence") || v === "div" || v === "paper_url"));
  const attrs = ["accession", "date", "region", "country", "division", "authors", "journal", "title", "url"];
  attrs.filter((v) => rawAttrs.indexOf(v) !== -1); // remove those "ideal" atttrs not actually present
  rawAttrs.forEach((v) => {
    if (attrs.indexOf(v) === -1 && includeAttr(v)) {
      attrs.push(v);
    }
  });
  for (const node of nodes) {
    if (node.hasChildren) {
      continue;
    }
    const line = [node.strain];
    // console.log(node.attr)
    for (const field of attrs) {
      if (Object.keys(node.attr).indexOf(field) === -1) {
        line.push("unknown");
      } else {
        const value = node.attr[field];
        if (typeof value === 'string') {
          if (value.lastIndexOf("http", 0) === 0) {
            line.push(formatURLString(value));
          } else {
            line.push(prettyString(value, {removeComma: true}));
          }
        } else if (typeof value === "number") {
          line.push(parseFloat(value).toFixed(2));
        } else if (typeof value === "object") {
          if (Array.isArray(value)) {
            if (typeof value[0] === "number") {
              line.push(value.map((v) => parseFloat(v).toFixed(2)).join(" - "));
            } else {
              line.push(value.map((v) => prettyString(v, {removeComma: true})).join(" - "));
            }
          } else { /* not an array, but a relational object */
            let x = "";
            for (const k of Object.keys(value)) {
              const v = typeof value[k] === "number" ? parseFloat(value[k]).toFixed(2) : prettyString(value[k], {removeComma: true});
              x += prettyString(k, {removeComma: true}) + ": " + v + ";";
            }
            line.push(x);
          }
        } else {
          console.warn("Tried to save " + value + " of type " + typeof value);
          line.push("unknown");
        }
      }
    }
    data.push(line);
  }
  const lineArray = [turnAttrsIntoHeaderArray(attrs).join("\t")];
  data.forEach((line) => {
    const lineString = line.join("\t");
    lineArray.push(lineString);
  });
  const tsvContent = lineArray.join("\n");
  write(filename, MIME.tsv, tsvContent);
  dispatch(infoNotification({message: "Metadata exported to " + filename}));
};

export const newick = (dispatch, filePrefix, root, temporal) => {
  const fName = temporal ? filePrefix + "_timetree.nwk" : filePrefix + "_tree.nwk";
  const message = temporal ? "TimeTree" : "Tree";
  write(fName, MIME.text, treeToNewick(root, temporal));
  dispatch(infoNotification({message: message + " written to " + fName}));
};

const processXMLString = (input) => {
  /* split into bounding <g> (or <svg>) tag, and inner paths / shapes etc */
  const parts = input.match(/^(<s?v?g.+?>)(.+)<\/s?v?g>$/);
  if (!parts) return undefined;
  /* extract width & height from the initial <g> bounding group */
  const dimensions = parts[1].match(/width="([0-9.]+)".+height="([0-9.]+)"/);
  if (!dimensions) return undefined;
  /* the map uses transform3d & viewbox */
  const viewbox = parts[1].match(/viewBox="([0-9-]+)\s([0-9-]+)\s([0-9-]+)\s([0-9-]+)"/);
  return {
    x: 0,
    y: 0,
    viewbox: viewbox ? viewbox.slice(1) : undefined,
    width: parseFloat(dimensions[1]),
    height: parseFloat(dimensions[2]),
    inner: parts[2]
  };
};

/* take the panels (see processXMLString for struct) and calculate the overall size of the SVG
as well as the offsets (x, y) to position panels appropriately within this */
const createBoundingDimensionsAndPositionPanels = (panels, panelLayout, numLinesOfText) => {
  const padding = 50;
  let width = 0;
  let height = 0;
  if (panels.tree && panels.mapD3 && panels.mapTiles) {
    if (panelLayout === "grid") {
      width = panels.tree.width + padding + panels.mapTiles.width;
      height = Math.max(panels.tree.height, panels.mapTiles.height);
      panels.mapD3.x = panels.tree.width + padding;
    } else {
      width = Math.max(panels.tree.width, panels.mapTiles.width);
      height = panels.tree.height + padding + panels.mapTiles.height;
      panels.mapD3.y = panels.tree.height + padding;
    }
    panels.mapTiles.x = panels.mapD3.x;
    panels.mapTiles.y = panels.mapD3.y;
  } else if (panels.tree) {
    width = panels.tree.width;
    height = panels.tree.height;
  } else if (panels.mapD3 && panels.mapTiles) {
    width = panels.mapTiles.width;
    height = panels.mapTiles.height;
  }
  /* need to adjust map demes & transmissions to account for panning */
  if (panels.mapD3) {
    // console.log("adding offsets to mapD3 x,y ", panels.mapD3._panOffsets.x, panels.mapD3._panOffsets.y);
    panels.mapD3.x += panels.mapD3._panOffsets.x;
    panels.mapD3.y += panels.mapD3._panOffsets.y;
  }

  if (panels.entropy) {
    if (width < panels.entropy.width) {
      width = panels.entropy.width;
    } else {
      panels.entropy.x = (width - panels.entropy.width) / 2;
    }
    if (height) {
      panels.entropy.y = height + padding;
      height += padding + panels.entropy.height;
    } else {
      height = panels.entropy.height;
    }
  }
  if (panels.frequencies) {
    if (width < panels.frequencies.width) {
      width = panels.frequencies.width;
    } else {
      panels.frequencies.x = (width - panels.frequencies.width) / 2;
    }
    if (height) {
      panels.frequencies.y = height + padding;
      height += padding + panels.frequencies.height;
    } else {
      height = panels.frequencies.height;
    }
  }
  /* add top&left padding */
  if (panels.tree) {panels.tree.x += padding; panels.tree.y += padding;}
  if (panels.mapD3) {panels.mapD3.x += padding; panels.mapD3.y += padding;}
  if (panels.mapTiles) {panels.mapTiles.x += padding; panels.mapTiles.y += padding;}
  if (panels.entropy) {panels.entropy.x += padding; panels.entropy.y += padding;}
  if (panels.frequencies) {panels.frequencies.x += padding; panels.frequencies.y += padding;}
  width += padding*2;
  height += padding*2;
  const textHeight = numLinesOfText * 36 + 20;
  height += textHeight;

  return {
    width,
    height,
    padding,
    textY: height - textHeight,
    textHeight
  };
};

const injectAsSVGStrings = (output, key, data) => {
  const svgTag = `<svg id="${key}" width="${data.width}" height="${data.height}" x="${data.x}" y="${data.y}">`;
  // if (data.viewbox) svgTag = svgTag.replace(">", ` viewBox="${data.viewbox.join(" ")}">`);
  output.push(svgTag);
  output.push(data.inner);
  output.push("</svg>");
};

/* define actual writer as a closure, because it may need to be triggered asyncronously */
const writeSVGPossiblyIncludingMapPNG = (dispatch, filePrefix, panelsInDOM, panelLayout, textStrings, mapTiles) => {
  const errors = [];
  /* for each panel present in the DOM, create a data structure with the dimensions & the paths/shapes etc */
  const panels = {tree: undefined, mapTiles: undefined, mapD3: undefined, entropy: undefined, frequencies: undefined};
  if (panelsInDOM.indexOf("tree") !== -1) {
    try {
      panels.tree = processXMLString((new XMLSerializer()).serializeToString(document.getElementById("d3TreeElement")));
    } catch (e) {
      panels.tree = undefined;
      errors.push("tree");
      console.error("Tree SVG save error:", e);
    }
  }
  if (panelsInDOM.indexOf("entropy") !== -1) {
    try {
      panels.entropy = processXMLString((new XMLSerializer()).serializeToString(document.getElementById("d3entropyParent")));
      panels.entropy.inner = panels.entropy.inner.replace(/<text/g, `<text class="txt"`);
      panels.entropy.inner = `<style>.txt { font-family: "Lato", "Helvetica Neue", "Helvetica", "sans-serif"; }</style>${panels.entropy.inner}`;
    } catch (e) {
      panels.entropy = undefined;
      errors.push("entropy");
      console.error("Entropy SVG save error:", e);
    }
  }
  if (panelsInDOM.indexOf("frequencies") !== -1) {
    try {
      panels.frequencies = processXMLString((new XMLSerializer()).serializeToString(document.getElementById("d3frequenciesSVG")));
    } catch (e) {
      panels.frequencies = undefined;
      errors.push("frequencies");
      console.error("Frequencies SVG save error:", e);
    }
  }
  if (panelsInDOM.indexOf("map") !== -1 && mapTiles) {
    panels.mapTiles = {
      x: 0,
      y: 0,
      viewbox: undefined,
      width: parseFloat(mapTiles.mapDimensions.x),
      height: parseFloat(mapTiles.mapDimensions.y),
      inner: `<image width="${mapTiles.mapDimensions.x}" height="${mapTiles.mapDimensions.y}" xlink:href="${mapTiles.base64map}"/>`
    };
    try {
      panels.mapD3 = processXMLString((new XMLSerializer()).serializeToString(document.getElementById("d3DemesTransmissions")));
      // modify the width & height of the mapD3 to match the tiles (not sure how this actually works in the DOM)
      panels.mapD3.width = panels.mapTiles.width;
      panels.mapD3.height = panels.mapTiles.height;
      panels.mapD3._panOffsets = mapTiles.panOffsets;
    } catch (e) {
      panels.mapD3 = undefined;
      panels.mapTiles = undefined;
      errors.push("map");
      console.error("Map demes & tranmisions SVG save error:", e);
    }
  }

  /* collect all panels as individual <svg> elements inside a bounding <svg> tag, and write to file */
  const output = [];
  /* logic for extracting the overall width etc */
  const overallDimensions = createBoundingDimensionsAndPositionPanels(panels, panelLayout, textStrings.length);
  output.push(`<svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" width="${overallDimensions.width}" height="${overallDimensions.height}">`);
  for (let key in panels) { // eslint-disable-line
    if (panels[key]) {
      injectAsSVGStrings(output, key, panels[key]); // modifies output in place
    }
  }
  /* add text to bottom of SVG in HTML format */
  output.push(`<foreignObject x="${overallDimensions.padding}" y="${overallDimensions.height - overallDimensions.textHeight}" height="${overallDimensions.textHeight}" width="${overallDimensions.width - 2*overallDimensions.padding}">`);
  textStrings.forEach((s) => {
    output.push(`<p xmlns="http://www.w3.org/1999/xhtml" style="font-family:lato,sans-serif;">`);
    output.push(s);
    output.push("</p>");
  });
  output.push("</foreignObject>");

  output.push("</svg>");
  // console.log(panels)
  // console.log(output)
  write(filePrefix + ".svg", MIME.svg, output.join("\n"));

  if (!errors.length) {
    dispatch(infoNotification({
      message: "Vector image saved",
      details: filePrefix + ".svg"
    }));
  } else {
    dispatch(warningNotification({
      message: "Vector image saved",
      details: `Saved to ${filePrefix}.svg, however there were errors with ${errors.join(", ")}`
    }));
  }
};

const getMapTilesErrorCallback = (e) => {
  console.warn("getMapTiles errorCallback", e);
};

export const SVG = (dispatch, filePrefix, panelsInDOM, panelLayout, textStrings) => {
  /* downloading the map tiles is an async call */
  if (panelsInDOM.indexOf("map") !== -1) {
    window.L.getMapTiles(writeSVGPossiblyIncludingMapPNG.bind(this, dispatch, filePrefix, panelsInDOM, panelLayout, textStrings), getMapTilesErrorCallback);
  } else {
    writeSVGPossiblyIncludingMapPNG(dispatch, filePrefix, panelsInDOM, panelLayout, textStrings, undefined);
  }
};
