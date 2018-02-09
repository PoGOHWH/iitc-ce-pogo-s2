// ==UserScript==
// @name         S2 Check
// @namespace    http://tampermonkey.net/
// @version      0.17
// @description  Find S2 properties
// @author       Alfonso M.
// @match        https://gymhuntr.com/*
// @match        https://gomap.eu/*
// @match        https://www.pokemongomap.info/*
// @grant        none
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */
/* globals L, S2, map, google */
/** S2 Geometry functions

 S2 extracted from Regions Plugin
 https:static.iitc.me/build/release/plugins/regions.user.js

 the regional scoreboard is based on a level 6 S2 Cell
 - https:docs.google.com/presentation/d/1Hl4KapfAENAOf4gv-pSngKwvS_jwNVHRPZTTDzXXn6Q/view?pli=1#slide=id.i22
 at the time of writing there's no actual API for the intel map to retrieve scoreboard data,
 but it's still useful to plot the score cells on the intel map


 the S2 geometry is based on projecting the earth sphere onto a cube, with some scaling of face coordinates to
 keep things close to approximate equal area for adjacent cells
 to convert a lat,lng into a cell id:
 - convert lat,lng to x,y,z
 - convert x,y,z into face,u,v
 - u,v scaled to s,t with quadratic formula
 - s,t converted to integer i,j offsets
 - i,j converted to a position along a Hubbert space-filling curve
 - combine face,position to get the cell id

 NOTE: compared to the google S2 geometry library, we vary from their code in the following ways
 - cell IDs: they combine face and the hilbert curve position into a single 64 bit number. this gives efficient space
						 and speed. javascript doesn't have appropriate data types, and speed is not cricical, so we use
						 as [face,[bitpair,bitpair,...]] instead
 - i,j: they always use 30 bits, adjusting as needed. we use 0 to (1<<level)-1 instead
				(so GetSizeIJ for a cell is always 1)
*/
(function () {

	const S2 = window.S2 = {};

	function LatLngToXYZ(latLng) {
		const d2r = Math.PI / 180.0;
		const phi = latLng.lat * d2r;
		const theta = latLng.lng * d2r;
		const cosphi = Math.cos(phi);

		return [Math.cos(theta) * cosphi, Math.sin(theta) * cosphi, Math.sin(phi)];
	}

	function XYZToLatLng(xyz) {
		const r2d = 180.0 / Math.PI;

		const lat = Math.atan2(xyz[2], Math.sqrt(xyz[0] * xyz[0] + xyz[1] * xyz[1]));
		const lng = Math.atan2(xyz[1], xyz[0]);

		return {lat: lat * r2d, lng: lng * r2d};
	}

	function largestAbsComponent(xyz) {
		const temp = [Math.abs(xyz[0]), Math.abs(xyz[1]), Math.abs(xyz[2])];

		if (temp[0] > temp[1]) {
			if (temp[0] > temp[2]) {
				return 0;
			}
			return 2;
		}

		if (temp[1] > temp[2]) {
			return 1;
		}

		return 2;
	}

	function faceXYZToUV(face,xyz) {
		let u, v;

		switch (face) {
			case 0: u =	xyz[1] / xyz[0]; v =	xyz[2] / xyz[0]; break;
			case 1: u = -xyz[0] / xyz[1]; v =	xyz[2] / xyz[1]; break;
			case 2: u = -xyz[0] / xyz[2]; v = -xyz[1] / xyz[2]; break;
			case 3: u =	xyz[2] / xyz[0]; v =	xyz[1] / xyz[0]; break;
			case 4: u =	xyz[2] / xyz[1]; v = -xyz[0] / xyz[1]; break;
			case 5: u = -xyz[1] / xyz[2]; v = -xyz[0] / xyz[2]; break;
			default: throw {error: 'Invalid face'};
		}

		return [u,v];
	}

	function XYZToFaceUV(xyz) {
		let face = largestAbsComponent(xyz);

		if (xyz[face] < 0) {
			face += 3;
		}

		const uv = faceXYZToUV(face, xyz);

		return [face, uv];
	}

	function FaceUVToXYZ(face, uv) {
		const u = uv[0];
		const v = uv[1];

		switch (face) {
			case 0: return [1, u, v];
			case 1: return [-u, 1, v];
			case 2: return [-u,-v, 1];
			case 3: return [-1,-v,-u];
			case 4: return [v,-1,-u];
			case 5: return [v, u,-1];
			default: throw {error: 'Invalid face'};
		}
	}

	function STToUV(st) {
		const singleSTtoUV = function (st) {
			if (st >= 0.5) {
				return (1 / 3.0) * (4 * st * st - 1);
			}
			return (1 / 3.0) * (1 - (4 * (1 - st) * (1 - st)));

		};

		return [singleSTtoUV(st[0]), singleSTtoUV(st[1])];
	}

	function UVToST(uv) {
		const singleUVtoST = function (uv) {
			if (uv >= 0) {
				return 0.5 * Math.sqrt (1 + 3 * uv);
			}
			return 1 - 0.5 * Math.sqrt (1 - 3 * uv);

		};

		return [singleUVtoST(uv[0]), singleUVtoST(uv[1])];
	}

	function STToIJ(st,order) {
		const maxSize = 1 << order;

		const singleSTtoIJ = function (st) {
			const ij = Math.floor(st * maxSize);
			return Math.max(0, Math.min(maxSize - 1, ij));
		};

		return [singleSTtoIJ(st[0]), singleSTtoIJ(st[1])];
	}

	function IJToST(ij,order,offsets) {
		const maxSize = 1 << order;

		return [
			(ij[0] + offsets[0]) / maxSize,
			(ij[1] + offsets[1]) / maxSize
		];
	}

	// hilbert space-filling curve
	// based on http://blog.notdot.net/2009/11/Damn-Cool-Algorithms-Spatial-indexing-with-Quadtrees-and-Hilbert-Curves
	// note: rather then calculating the final integer hilbert position, we just return the list of quads
	// this ensures no precision issues whth large orders (S3 cell IDs use up to 30), and is more
	// convenient for pulling out the individual bits as needed later
	function pointToHilbertQuadList(x,y,order) {
		const hilbertMap = {
			'a': [[0,'d'], [1,'a'], [3,'b'], [2,'a']],
			'b': [[2,'b'], [1,'b'], [3,'a'], [0,'c']],
			'c': [[2,'c'], [3,'d'], [1,'c'], [0,'b']],
			'd': [[0,'a'], [3,'c'], [1,'d'], [2,'d']]
		};

		let currentSquare = 'a';
		const positions = [];

		for (let i = order - 1; i >= 0; i--) {

			const mask = 1 << i;

			const quad_x = x & mask ? 1 : 0;
			const quad_y = y & mask ? 1 : 0;
			const t = hilbertMap[currentSquare][quad_x * 2 + quad_y];

			positions.push(t[0]);

			currentSquare = t[1];
		}

		return positions;
	}

	// S2Cell class
	S2.S2Cell = function () {};

	//static method to construct
	S2.S2Cell.FromLatLng = function (latLng, level) {
		const xyz = LatLngToXYZ(latLng);
		const faceuv = XYZToFaceUV(xyz);
		const st = UVToST(faceuv[1]);
		const ij = STToIJ(st,level);

		return S2.S2Cell.FromFaceIJ(faceuv[0], ij, level);
	};

	S2.S2Cell.FromFaceIJ = function (face, ij, level) {
		const cell = new S2.S2Cell();
		cell.face = face;
		cell.ij = ij;
		cell.level = level;

		return cell;
	};

	S2.S2Cell.prototype.toString = function () {
		return 'F' + this.face + 'ij[' + this.ij[0] + ',' + this.ij[1] + ']@' + this.level;
	};

	S2.S2Cell.prototype.getLatLng = function () {
		const st = IJToST(this.ij, this.level, [0.5, 0.5]);
		const uv = STToUV(st);
		const xyz = FaceUVToXYZ(this.face, uv);

		return XYZToLatLng(xyz);
	};

	S2.S2Cell.prototype.getCornerLatLngs = function () {
		const offsets = [
			[0.0, 0.0],
			[0.0, 1.0],
			[1.0, 1.0],
			[1.0, 0.0]
		];

		return offsets.map(offset => {
			const st = IJToST(this.ij, this.level, offset);
			const uv = STToUV(st);
			const xyz = FaceUVToXYZ(this.face, uv);

			return XYZToLatLng(xyz);
		});
	};

	S2.S2Cell.prototype.getFaceAndQuads = function () {
		const quads = pointToHilbertQuadList(this.ij[0], this.ij[1], this.level);

		return [this.face, quads];
	};

	S2.S2Cell.prototype.getNeighbors = function (deltas) {

		const fromFaceIJWrap = function (face,ij,level) {
			const maxSize = 1 << level;
			if (ij[0] >= 0 && ij[1] >= 0 && ij[0] < maxSize && ij[1] < maxSize) {
				// no wrapping out of bounds
				return S2.S2Cell.FromFaceIJ(face,ij,level);
			}
			// the new i,j are out of range.
			// with the assumption that they're only a little past the borders we can just take the points as
			// just beyond the cube face, project to XYZ, then re-create FaceUV from the XYZ vector

			let st = IJToST(ij,level,[0.5, 0.5]);
			let uv = STToUV(st);
			let xyz = FaceUVToXYZ(face, uv);
			const faceuv = XYZToFaceUV(xyz);
			face = faceuv[0];
			uv = faceuv[1];
			st = UVToST(uv);
			ij = STToIJ(st,level);
			return S2.S2Cell.FromFaceIJ(face, ij, level);
		};

		const face = this.face;
		const i = this.ij[0];
		const j = this.ij[1];
		const level = this.level;

		if (!deltas) {
			deltas = [
				{a: -1, b: 0},
				{a: 0, b: -1},
				{a: 1, b: 0},
				{a: 0, b: 1}
			];
		}
		return deltas.map(function (values) {
			return fromFaceIJWrap(face, [i + values.a, j + values.b], level);
		});
		/*
		return [
			fromFaceIJWrap(face, [i - 1, j], level),
			fromFaceIJWrap(face, [i, j - 1], level),
			fromFaceIJWrap(face, [i + 1, j], level),
			fromFaceIJWrap(face, [i, j + 1], level)
		];
		*/
	};
})();

/** Our code
* For safety, S2 must be initialized before our code
*/
(function () {
	'use strict';

	/* eslint-disable */
	/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */
	var saveAs=saveAs||function(e){"use strict";if(typeof navigator!=="undefined"&&/MSIE [1-9]\./.test(navigator.userAgent)){return}var t=e.document,n=function(){return e.URL||e.webkitURL||e},r=t.createElementNS("http://www.w3.org/1999/xhtml","a"),i="download"in r,o=function(e){var t=new MouseEvent("click");e.dispatchEvent(t)},a=/Version\/[\d\.]+.*Safari/.test(navigator.userAgent),f=e.webkitRequestFileSystem,u=e.requestFileSystem||f||e.mozRequestFileSystem,s=function(t){(e.setImmediate||e.setTimeout)(function(){throw t},0)},c="application/octet-stream",d=0,l=500,w=function(t){var r=function(){if(typeof t==="string"){n().revokeObjectURL(t)}else{t.remove()}};if(e.chrome){r()}else{setTimeout(r,l)}},p=function(e,t,n){t=[].concat(t);var r=t.length;while(r--){var i=e["on"+t[r]];if(typeof i==="function"){try{i.call(e,n||e)}catch(o){s(o)}}}},v=function(e){if(/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(e.type)){return new Blob(["\ufeff",e],{type:e.type})}return e},y=function(t,s,l){if(!l){t=v(t)}var y=this,m=t.type,S=false,h,R,O=function(){p(y,"writestart progress write writeend".split(" "))},g=function(){if(R&&a&&typeof FileReader!=="undefined"){var r=new FileReader;r.onloadend=function(){var e=r.result;R.location.href="data:attachment/file"+e.slice(e.search(/[,;]/));y.readyState=y.DONE;O()};r.readAsDataURL(t);y.readyState=y.INIT;return}if(S||!h){h=n().createObjectURL(t)}if(R){R.location.href=h}else{var i=e.open(h,"_blank");if(i==undefined&&a){e.location.href=h}}y.readyState=y.DONE;O();w(h)},b=function(e){return function(){if(y.readyState!==y.DONE){return e.apply(this,arguments)}}},E={create:true,exclusive:false},N;y.readyState=y.INIT;if(!s){s="download"}if(i){h=n().createObjectURL(t);r.href=h;r.download=s;setTimeout(function(){o(r);O();w(h);y.readyState=y.DONE});return}if(e.chrome&&m&&m!==c){N=t.slice||t.webkitSlice;t=N.call(t,0,t.size,c);S=true}if(f&&s!=="download"){s+=".download"}if(m===c||f){R=e}if(!u){g();return}d+=t.size;u(e.TEMPORARY,d,b(function(e){e.root.getDirectory("saved",E,b(function(e){var n=function(){e.getFile(s,E,b(function(e){e.createWriter(b(function(n){n.onwriteend=function(t){R.location.href=e.toURL();y.readyState=y.DONE;p(y,"writeend",t);w(e)};n.onerror=function(){var e=n.error;if(e.code!==e.ABORT_ERR){g()}};"writestart progress write abort".split(" ").forEach(function(e){n["on"+e]=y["on"+e]});n.write(t);y.abort=function(){n.abort();y.readyState=y.DONE};y.readyState=y.WRITING}),g)}),g)};e.getFile(s,{create:false},b(function(e){e.remove();n()}),b(function(e){if(e.code===e.NOT_FOUND_ERR){n()}else{g()}}))}),g)}),g)},m=y.prototype,S=function(e,t,n){return new y(e,t,n)};if(typeof navigator!=="undefined"&&navigator.msSaveOrOpenBlob){return function(e,t,n){if(!n){e=v(e)}return navigator.msSaveOrOpenBlob(e,t||"download")}}m.abort=function(){var e=this;e.readyState=e.DONE;p(e,"abort")};m.readyState=m.INIT=0;m.WRITING=1;m.DONE=2;m.error=m.onwritestart=m.onprogress=m.onwrite=m.onabort=m.onerror=m.onwriteend=null;return S}(typeof self!=="undefined"&&self||typeof window!=="undefined"&&window||this.content);if(typeof module!=="undefined"&&module.exports){module.exports.saveAs=saveAs}else if(typeof define!=="undefined"&&define!==null&&define.amd!=null){define([],function(){return saveAs})}
	/* eslint-enable */

	const pokestops = {};
	const gyms = {};
	window.pokestops = pokestops;
	window.gyms = gyms;

	let gridLevel = 14;
	let regionLayer;
	let gmapItems = [];
	let highlightGymCandidateCells = false;
	let highlihgtGymCenter = false;

	let colorScheme = {
		// https://www.materialui.co/colors
		level: {
			// teal
			9: '#004D40',
			10: '#00695C',
			11: '#00796B',
			12: '#00897B',
			13: '#009688',
			14: '#26A69A',
			// Green
			15: '#1B5E20',
			16: '#2E7D32',
			17: '#388E3C',
			18: '#43A047',
			19: '#4CAF50',
			20: '#66BB6A'
		},
		missingStops: {
			1: '#BF360C',
			2: '#E64A19',
			3: '#FF5722'
		}
	};

	function analyzeData() {
		const allCells = groupByCell(gridLevel);

		const cells = filterByMapBounds(allCells);
		showCellSummary(cells);
	}

	function saveGridAnalysis(cells) {
		const filename = 'S2_' + gridLevel + '_' + new Date().getTime() + '.json';
		const blob = new Blob([JSON.stringify(cells)], {
			type: 'text/plain;charset=utf-8'
		});
		saveAs(blob, filename);
	}

	function sortGyms(a, b) {
		if (a.name > b.name) {
			return 1;
		}
		if (a.name < b.name) {
			return -1;
		}
		// a must be equal to b
		return 0;
	}
	function showCellSummary(cells) {
		const keys = Object.keys(cells);
		const summary = [];
		//summary.push('<h1>Total number of cells: ' + keys.length + '</h1>');
		summary.push('<h3>Analysis Results <i class="fa fa-save" title="Click to save the analysis"></i></h3>');
		summary.push('<div class="S2Analysis"><table>');
		summary.push('<thead><tr><th> </th><th>Cell</th><th>Stops</th><th>Gyms</th><th>Gym names</th></tr>');
		let i = 1;
		keys.forEach(name => {
			const cellData = cells[name];
			const cellCenter = cellData.cell.getLatLng();
			const gymSummary = cellData.gyms.sort(sortGyms).map(gym => '<a data-lat="' + gym.lat + '" data-lng="' + gym.lng + '">' + gym.name.substr(0, 20) + '</a>').join(', ');
			summary.push('<tr><td>' + i + '</td><td>' + '<a data-lat="' + cellCenter.lat + '" data-lng="' + cellCenter.lng + '">' + name + '</a></td><td>' + cellData.stops.length + '</td><td>' + cellData.gyms.length + '</td><td class="s2-gymnames">' + gymSummary + '</td></tr>');
			i++;
		});
		summary.push('</table></div>');
		const dialog = document.getElementById('S2Summary');
		dialog.querySelector('#S2SummaryContent').innerHTML = summary.join('\r\n');
		dialog.style.display = 'block';
		dialog.querySelector('h3 i').addEventListener('click', e => saveGridAnalysis(cells));
	}
	
	// return only the cells that are visible by the map bounds to ignore far away data that might not be complete
	function filterByMapBounds(cells) {
		const bounds = map.getBounds();
		const filtered = {};
		Object.keys(cells).forEach(cellId => {
			const cellData = cells[cellId];
			const cell = cellData.cell;

			if (isCellOnScreen(bounds, cell)) {
				filtered[cellId] = cellData;
			}
		});
		return filtered;
	}

	function isCellOnScreen(mapBounds, cell) {
		const corners = cell.getCornerLatLngs();
		if (typeof L != 'undefined') {
			const cellBounds = L.latLngBounds([corners[0],corners[1]]).extend(corners[2]).extend(corners[3]);
			return cellBounds.intersects(mapBounds);
		}
		const cellBounds = new google.maps.LatLngBounds(corners[0],corners[1]).extend(corners[2]).extend(corners[3]);
		return cellBounds.intersects(mapBounds);
	}

	/**
	* Filter a group of items (gyms/stops) excluding those out of the screen
	*/
	function filterItemsByMapBounds(items) {
		const bounds = map.getBounds();
		const filtered = {};
		Object.keys(items).forEach(id => {
			const item = items[id];

			if (isPointOnScreen(bounds, item)) {
				filtered[id] = item;
			}
		});
		return filtered;
	}

	function isPointOnScreen(mapBounds, point) {
		if (typeof L != 'undefined') {
			return mapBounds.contains(L.latLng(point));
		}

		return mapBounds.contains(point);
	}

	function groupByCell(level) {
		const cells = {};
		Object.keys(gyms).forEach(id => {
			const gym = gyms[id];
			let cell;
			// Compute the cell only once for each level
			if (!gym.cells[level]) {
				cell = window.S2.S2Cell.FromLatLng(gym, level);
				gym.cells[level] = cell.toString();
			}
			const cellId = gym.cells[level];

			// Add it to the array of gyms of that cell
			if (!cells[cellId]) {
				if (!cell) {
					cell = window.S2.S2Cell.FromLatLng(gym, level);
				}
				cells[cellId] = {
					cell: cell,
					gyms: [],
					stops: []
				};
			}
			cells[cellId].gyms.push(gym);
		});

		Object.keys(pokestops).forEach(id => {
			const pokestop = pokestops[id];
			let cell;
			// Compute the cell only once for each level
			if (!pokestop.cells[level]) {
				cell = window.S2.S2Cell.FromLatLng(pokestop, level);
				pokestop.cells[level] = cell.toString();
			}
			const cellId = pokestop.cells[level];
			// Add it to the array of stops of that cell
			if (!cells[cellId]) {
				if (!cell) {
					cell = window.S2.S2Cell.FromLatLng(pokestop, level);
				}
				cells[cellId] = {
					cell: cell,
					gyms: [],
					stops: []
				};
			}
			cells[cellId].stops.push(pokestop);
		});
		return cells;
	}

	function showButton(parent) {
		const button = document.createElement('button');
		button.id = 's2gridbtn';
		button.className = 'button button-circle';
		button.innerHTML = '<span class="inner"><i class="fa fa-table"></i></span>';
		button.title = 'Find S2 distribution';

		parent.appendChild(button);

		button.addEventListener('click', e => {
			const dialog = document.getElementById('s2dialog');
			dialog.style.display = dialog.style.display == 'none' ? 'block' : 'none';
		});
		//	button.addEventListener('click', analyzeData);
	}

	/*
	function showSaveButton() {
		const button = document.createElement('button');
		button.className = 'button button-circle';
		button.innerHTML = '<span class="inner"><i class="fa fa-save"></i></span>';
		button.title = 'Save Gyms and Portals';

		document.querySelector('.controls').appendChild(button);
		button.addEventListener('click', saveGymStopsJSON);
	}
	*/
	function saveGymStopsJSON() {
		const filename = 'gyms+stops_' + new Date().getTime() + '.json';
		const data = {gyms: filterItemsByMapBounds(gyms), pokestops: filterItemsByMapBounds(pokestops)};
		const blob = new Blob([JSON.stringify(data)], {
			type: 'text/plain;charset=utf-8'
		});
		saveAs(blob, filename);
	}

	function saveCSV(allData, title) {
		const data = filterItemsByMapBounds(allData);
		const keys = Object.keys(data);
		const contents = keys.map(id => {
			const gym = data[id];
			return (gym.name ? gym.name.replace(/,/g, ' ') + ',' : '') + gym.lat + ',' + gym.lng;
		});
		const filename = title + '_' + new Date().getTime() + '.csv';
		const blob = new Blob([contents.join('\n')], {
			type: 'text/plain;charset=utf-8'
		});
		saveAs(blob, filename);
	}

	function addDialog() {
		const html = `
			<h3>S2 Cells</h3>
			<p>Select the level of grid to display: <select>
			<option value=0>None</option>
			<option value=9>9</option>
			<option value=10>10</option>
			<option value=11>11</option>
			<option value=12>12</option>
			<option value=13>13</option>
			<option value=14>14</option>
			<option value=15>15</option>
			<option value=16>16</option>
			<option value=17>17</option>
			<option value=18>18</option>
			<option value=19>19</option>
			<option value=20>20</option>
			</select></p>
			<p><label><input type="checkbox" id="chkHighlightCandidates">Highlight Cells that might get a Gym</label></p>
			<p><label><input type="checkbox" id="chkHighlightCenters">Highlight centers of Cells with a Gym</label></p>
			<p><button class="btn btn-primary" id="save-json"><i class="fa fa-save"></i> Save Gyms and Stops as JSON</button></p>
			<p><button class="btn btn-primary" id="save-gymscsv"><i class="fa fa-save"></i> Save Gyms as CSV</button></p>
			<p><button class="btn btn-primary" id="save-stopscsv"><i class="fa fa-save"></i> Save Stops as CSV</button></p>
			<p><button class="btn btn-primary" id="show-summary"> Show Analysis</button>
			 `;

		const div = insertDialogTemplate(html, 's2dialog');

		div.querySelector('#save-json').addEventListener('click', e => saveGymStopsJSON());
		div.querySelector('#save-gymscsv').addEventListener('click', e => saveCSV(gyms, 'Gyms'));
		div.querySelector('#save-stopscsv').addEventListener('click', e => saveCSV(pokestops, 'Pokestops'));
		div.querySelector('#show-summary').addEventListener('click', e => analyzeData());
		const select = div.querySelector('select');
		select.value = gridLevel;
		select.addEventListener('change', e => {
			gridLevel = parseInt(select.value, 10);
			updateMapGrid();
		});
		// In gymhuntr the styles of the checkbox look reversed, checked is red and unchecked green.
		const reverseCheckbox = document.location.hostname == 'gymhuntr.com';
		const chkHighlight = div.querySelector('#chkHighlightCandidates');
		chkHighlight.checked = highlightGymCandidateCells;
		if (reverseCheckbox) {
			chkHighlight.checked = !chkHighlight.checked;
		}
		chkHighlight.addEventListener('change', e => {
			highlightGymCandidateCells = chkHighlight.checked;
			if (reverseCheckbox) {
				highlightGymCandidateCells = !chkHighlight.checked;
			}
			updateMapGrid();
		});

		const chkHighlightCenters = div.querySelector('#chkHighlightCenters');
		chkHighlightCenters.checked = highlihgtGymCenter;
		if (reverseCheckbox) {
			chkHighlightCenters.checked = !chkHighlightCenters.checked;
		}
		chkHighlightCenters.addEventListener('change', e => {
			highlihgtGymCenter = chkHighlightCenters.checked;
			if (reverseCheckbox) {
				highlihgtGymCenter = !chkHighlightCenters.checked;
			}
			updateMapGrid();
		});

		addSummaryDialog();
	}

	function addSummaryDialog() {
		const html = '<div id="S2SummaryContent"></div>';
		const div = insertDialogTemplate(html, 'S2Summary');

		// clicking on any of the 'a' elements in the dialog, close it and center the map there.
		div.addEventListener('click', e => {
			const target = e.target;
			if (target.nodeName != 'A') {
				return;
			}
			div.style.display = 'none';
			document.getElementById('s2dialog').style.display = 'none';
			const lat = target.dataset.lat;
			const lng = target.dataset.lng;
			mapPanTo(lat, lng);
		});
	} 

	function mapPanTo(lat, lng) {
		if (typeof L != 'undefined') {
			map.panTo(new L.LatLng(lat, lng));
		} else {
			map.panTo({lat, lng});
		}
	}

	function insertDialogTemplate(content, id) {
		const html = `<div class="filter-box">
			  <div class="close-button"><i class="fa fa-times"></i></div>
			  ${content}
			</div>`;

		const div = document.createElement('div');
		div.id = id;
		div.className = 'filters';
		div.style.display = 'none';
		div.innerHTML = html;
		document.body.appendChild(div);

		div.querySelector('.close-button').addEventListener('click', e => div.style.display = 'none');
		
		return div;
	}

	function interceptGymHuntr() {
		captureLeafletMap();

		// Sponsored gyms/stops don't have a suffix
		const markSponsored = function (data) {
			if (data.guid.length == 32) {
				data.sponsored = true;
				if (data.name) {
					data.name += ' ($)';
				}
			}
		};
		const origOpen = XMLHttpRequest.prototype.open;
		// add our handler as a listener to every XMLHttpRequest
		XMLHttpRequest.prototype.open = function () {
			this.addEventListener('load', function (xhr) {

				/** 
				 * The guid might come sometimes encoded as base64
				 */
				const parseGymHunterId = function (id) {
					try {
						// Try to decode it
						const decoded = atob(id);
						// Now call it again to decode or return the current value
						return parseGymHunterId(decoded);
					} catch (e) {
						// if it can't be decoded, return it as is
						return id;
					}
				};

				let json;
				if (this.responseText.indexOf('gyms') > 0) {
					json = JSON.parse(this.responseText);

					json.gyms.forEach(function (gym) {
						const pokegym = JSON.parse(gym);
						const id = parseGymHunterId(pokegym.gym_id);
						if (gyms[id]) {
							return;
						}
						// coordinates seem reversed
						const data = {
							guid: pokegym.gym_id,
							name: pokegym.gym_name,
							lat: pokegym.longitude,
							lng: pokegym.latitude
						};
						computeCells(data);
						markSponsored(data);
						gyms[id] = data;
					});
				}
				if (this.responseText.indexOf('pokestops') > 0) {
					if (!json) {
						json = JSON.parse(this.responseText);
					}

					json.pokestops.forEach(function (stop) {
						const pokestop = JSON.parse(stop);
						const id = parseGymHunterId(pokestop.pokestop_id);
						
						if (pokestops[id]) {
							return;
						}
						// coordinates seem reversed
						const data = {
							guid: pokestop.pokestop_id,
							lat: pokestop.longitude,
							lng: pokestop.latitude
						};
						computeCells(data);
						markSponsored(data);
						pokestops[id] = data;
					});
				}
			});
			origOpen.apply(this, arguments);
		};
		showButton(document.querySelector('.controls'));
		addDialog();
		injectStyles();
	}

	function injectStyles() {
		const css = `
			.filters {
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				z-index: 1000;
				background: rgba(0, 0, 0, .5);
				text-align: center;
			}

			.filters .filter-box {
				background: #fff;
				margin-top: 5%;
				padding: 10px;
				border-radius: 3px;
				display: inline-block;
				width: 350px;
				box-sizing: border-box;
			}

			#S2Summary .filter-box {
				width: auto;
			}

			.filters .close-button {
				float: right;
				display: inline-block;
				padding: 2px 5px;
				color: #555;
				cursor: pointer;
			}

			.s2-gymnames {
				text-align: left;
			}

			#S2SummaryContent {
				max-height: 90vh;
				overflow-y: auto;
			}

			#S2SummaryContent tr:nth-child(even) {
				background: #FBFBFB;
			}

			.S2Analysis tr:nth-child(odd) td {
				background: #f0f0f0;
			}

			.S2Analysis th {
				text-align: center;
				padding: 1px 5px 2px;
			}

			.S2Analysis h3 i {
				color: rgba(57, 176, 45, 1);
				cursor: pointer;
			}

			.S2Analysis a {
				color: rgba(57, 176, 45, 1);
				cursor: pointer;
			}

			body > #s2gridbtn {
				z-index: 400;
				position: absolute;
				top: 170px;
				left: 32px;
			}

			.s2check-text {
				text-align: center;
				font-weight: bold;
				border: none !important;
				background: none !important;
				font-size: 130%;
				text-shadow: 1px 1px #FFF, 2px 2px 6px #fff, -1px -1px #fff, -2px -2px 6px #fff;
			}

			.s2grid-btn {
				font-weight: 500;
				background-color: rgb(255, 255, 255);
				box-shadow: 0px 1px 4px -1px rgba(0, 0, 0, 0.2);
				border-radius: 2px;
				height: 29px;
				position: relative;
				right: 10px;
				cursor: pointer;
				margin-top: 10px;
				margin-left: 10px;
				border: 1px solid #ccc;
			}
			.s2grid-txt {
				color: rgb(86, 86, 86);
				font-family: Roboto,Arial,sans-serif;
				user-select: none;
				font-size: 11px;
				font-weight: 400;
				line-height: 29px;
				display: inline-block;
				vertical-align: middle;
				padding-left: 8px;
				padding-right: 8px;
			}
			`;
		const style = document.createElement('style');
		style.type = 'text/css';
		style.innerHTML = css;
		document.querySelector('head').appendChild(style);
	}

	function interceptGoMap() {
		captureLeafletMap();

		const origOpen = XMLHttpRequest.prototype.open;
		// add our handler as a listener to every XMLHttpRequest
		XMLHttpRequest.prototype.open = function () {
			this.addEventListener('load', function (xhr) {
				let json;
				if (this.responseText.indexOf('gyms') > 0) {
					json = JSON.parse(this.responseText);

					json.gyms.forEach(function (pokegym) {
						const id = pokegym.gym_id;
						if (gyms[id]) {
							return;
						}
						// gym_id is not a real guid
						const data = {
							name: pokegym.name,
							lat: pokegym.latitude,
							lng: pokegym.longitude
						};
						computeCells(data);
						gyms[id] = data;
					});
				}
				if ((json && json.pstops) || this.responseText.indexOf('pstops') > 0) {
					if (!json) {
						json = JSON.parse(this.responseText);
					}

					json.pstops.forEach(function (pokestop) {
						const id = pokestop.id;
						if (pokestops[id]) {
							return;
						}
						const data = {
							lat: pokestop.latitude,
							lng: pokestop.longitude
						};
						computeCells(data);
						pokestops[id] = data;
					});
				}
			});
			origOpen.apply(this, arguments);
		};
		showButton(document.body);
		addDialog();
		injectStyles();
	}

	function catchGoogleMap() {
		google.maps.orgMarker = google.maps.Marker;
		google.maps.Marker = function (a) { 
			analyzeMarker(a);
			return new google.maps.orgMarker(a);
		};
	}

	function analyzeMarker(marker) {
		const id = marker.mrkdid;
		const url = marker.url;
		if (!id || !url) {
			return;
		}
		const isGym = url.substr(1, 3) == 'gym';

		if (isGym) {
			if (gyms[id]) 
				return;
		} else {
			if (pokestops[id]) {
				return;
			}
		}

		const data = {
			name: marker.pokemrkztit,
			lat: marker.position.lat().toFixed(6),
			lng: marker.position.lng().toFixed(6)
		};
		computeCells(data);
		if (isGym) {
			gyms[id] = data;
		} else {
			pokestops[id] = data;
		}
	}

	function interceptPokemonGoMapInfo() {
		// It uses Google maps.
		map.addListener('bounds_changed', updateMapGrid);

		initializeLabels();

		// detect gyms&stops
		catchGoogleMap();

		// Inject grid button
		const controlDiv = document.createElement('div');

		const button = document.createElement('div');
		button.id = 's2gridbtn';
		button.className = 's2grid-btn';
		button.innerHTML = '<span class="s2grid-txt"><i class="fa fa-table"></i> S2 Grid</span>';
		button.title = 'Find S2 distribution';

		controlDiv.appendChild(button);

		button.addEventListener('click', e => {
			const dialog = document.getElementById('s2dialog');
			dialog.style.display = dialog.style.display == 'none' ? 'block' : 'none';
		});

		controlDiv.index = 1;
		map.controls[google.maps.ControlPosition.TOP_RIGHT].push(controlDiv);

		addDialog();
		injectStyles();
	}


	/**
	 * Creates an object to store the cells for the gym/stop, compute the level 14 by default
	 */
	function computeCells(item) {
		item.cells = {};
		const cell = window.S2.S2Cell.FromLatLng(item, 14);
		item.cells[14] = cell.toString();
	}

	function captureLeafletMap() {
		// get a reference to the Leaflet map object
		const orgLayer = L.Map.prototype.addLayer;
		L.Map.prototype.addLayer = function () { 
			// save global reference
			window.map = this;
			// restore addLayer method
			L.Map.prototype.addLayer = orgLayer;

			initMap(this);
			return orgLayer.apply(this, arguments);
		};
	}

	function cleanAds() {
		const containers = document.querySelectorAll('.advert, iframe');
		[...containers].forEach(node => node.parentNode.removeChild(node));
	}

	function initS2checker() {
		if (window.frameElement) {
			return;
		}

		if (window.FuckAdBlock) {
			cleanAds();
		}

		if (document.location.hostname == 'gymhuntr.com' && document.querySelector('.controls')) {
			interceptGymHuntr();
		}
		if (document.location.hostname == 'gomap.eu') {
			interceptGoMap();
			/*
			window.setTimeout(o => {
				const mapo = document.getElementById('mapo');
				if (mapo) {
					mapo.style.height = '100%';
					document.body.removeChild(document.body.firstElementChild);
				}
			}, 50);
			*/
		}
		if (document.location.hostname == 'www.pokemongomap.info') {
			interceptPokemonGoMapInfo();
		}

	}

	/**
	 * We got a reference to the Leaflet map object, initialize our overlay
	 */
	function initMap(map) {
		regionLayer = L.layerGroup();
		map.addLayer(regionLayer);
		map.on('moveend', updateMapGrid);
		updateMapGrid();
	}

	/**
	 * Refresh the S2 grid over the map
	 */
	function updateMapGrid() {
		if (regionLayer) {
			regionLayer.clearLayers();
		} else {
			gmapItems.forEach(item => item.setMap(null));
		}

		const bounds = map.getBounds();
		const seenCells = {};
		const drawCellAndNeighbors = function (cell) {
			const cellStr = cell.toString();

			if (!seenCells[cellStr]) {
				// cell not visited - flag it as visited now
				seenCells[cellStr] = true;

				if (isCellOnScreen(bounds, cell)) {
					// on screen - draw it
					drawCell(cell, colorScheme.level[gridLevel], 5, 0.5);

					// and recurse to our neighbors
					const neighbors = cell.getNeighbors();
					for (let i = 0; i < neighbors.length; i++) {
						drawCellAndNeighbors(neighbors[i]);
					}
				}
			}
		};

		// center cell
		const zoom = map.getZoom();
		if (zoom < 5) {
			return;
		}
		if (gridLevel >= 6) {
			const cell = S2.S2Cell.FromLatLng(getLatLngPoint(map.getCenter()), gridLevel);
			drawCellAndNeighbors(cell);
		}
		if (highlightGymCandidateCells) {
			updateCandidateCells();
		}	
		if (highlihgtGymCenter) {
			updateGymCenters();
		}	
	}

	function getLatLngPoint(data) {
		const result = {
			lat: typeof data.lat == 'function' ? data.lat() : data.lat,
			lng: typeof data.lng == 'function' ? data.lng() : data.lng
		};

		return result;
	}

	/**
	 * Highlight cells that are missing a few stops to get another gym
	 * based on https://www.reddit.com/r/TheSilphRoad/comments/7ppb3z/gyms_pok%C3%A9stops_and_s2_cells_followup_research/ data
	 * Cutt offs: 2, 6, 20
	 */
	function updateCandidateCells() {
		const level = 14;
		// All cells with items
		const allCells = groupByCell(level);
		// Get only cells in the screen
		//const cells = filterByMapBounds(allCells);

		const bounds = map.getBounds();
		const seenCells = {};
		const cellsToDraw = {
			1: [],
			2: [],
			3: []
		};
		const drawCellAndNeighbors = function (cell) {
			const cellStr = cell.toString();

			if (!seenCells[cellStr]) {
				// cell not visited - flag it as visited now
				seenCells[cellStr] = true;

				if (isCellOnScreen(bounds, cell)) {
					// on screen - draw it
					const cellData = allCells[cellStr];
					if (cellData) {
						const missingStops = cellData ? computeMissingStops(cellData) : 2;
						switch (missingStops) {
							case 0:
								fillCell(cell, 'black', 0.5);
								break;
							case 1:
							case 2:
							case 3:
								cellsToDraw[missingStops].push(cell);
								coverBlockedAreas(cellData);
								writeInCell(cell, missingStops);
								break;
							default:
								coverBlockedAreas(cellData);
								writeInCell(cell, missingStops);
								break;
						}
					}

					// and recurse to our neighbors
					const neighbors = cell.getNeighbors();
					for (let i = 0; i < neighbors.length; i++) {
						drawCellAndNeighbors(neighbors[i]);
					}
				}
			}
		};

		const cell = S2.S2Cell.FromLatLng(getLatLngPoint(map.getCenter()), level);
		drawCellAndNeighbors(cell);
		// Draw missing cells in reverse order
		for (let missingStops = 3; missingStops >= 1; missingStops--) {
			const color = colorScheme.missingStops[missingStops];
			cellsToDraw[missingStops].forEach(cell => drawCell(cell, color, 3, 1));
		}
	}

	/**
	 * Draw a cross to the center of level 20 cells that have a Gym to check better EX locations
	 */
	function updateGymCenters() {
		const visibleGyms = filterItemsByMapBounds(gyms);
		const level = 20;

		Object.keys(visibleGyms).forEach(id => {
			const gym = gyms[id];
			const cell = window.S2.S2Cell.FromLatLng(gym, level);
			const corners = cell.getCornerLatLngs();
			// center point
			const center = cell.getLatLng();

			if (regionLayer) {
				const style = {fill: false, color: 'red', opacity: 0.8, weight: 1, clickable: false};
				const line1 = L.polyline([corners[0], corners[2]], style);
				regionLayer.addLayer(line1);

				const line2 = L.polyline([corners[1], corners[3]], style);
				regionLayer.addLayer(line2);

				const circle = L.circle(center, 1, style);
				regionLayer.addLayer(circle);

			} else {
				const line1 = new google.maps.Polyline({
					path: [corners[0], corners[2]],
					strokeColor: 'red',
					strokeOpacity: 0.8,
					strokeWeight: 1,
					map: map
				});
				gmapItems.push(line1);

				const line2 = new google.maps.Polyline({
					path: [corners[1], corners[3]],
					strokeColor: 'red',
					strokeOpacity: 0.8,
					strokeWeight: 1,
					map: map
				});
				gmapItems.push(line2);

				const circle = new google.maps.Circle({
					center: center,
					radius: 1,
					strokeColor: 'red',
					strokeOpacity: 0.8,
					strokeWeight: 1,
					map: map
				});
				gmapItems.push(circle);

			}

		});
	}

	function coverBlockedAreas(cellData) {
		if (!cellData)
			return;
		cellData.gyms.forEach(coverLevel17Cell);
		cellData.stops.forEach(coverLevel17Cell);
	}

	function coverLevel17Cell(point) {
		const cell = S2.S2Cell.FromLatLng(point, 17);
		fillCell(cell, 'black', 0.6);
	}

	function computeMissingStops(cellData) {
		const sum = cellData.gyms.length + cellData.stops.length;
		if (sum < 2)
			return 2 - sum;

		if (sum < 6)
			return 6 - sum;

		if (sum < 20)
			return 20 - sum;

		// No options to more gyms ATM.
		return 0;
	}

	function drawCell(cell, color, weight, opacity) {
		// corner points
		const corners = cell.getCornerLatLngs();

		if (regionLayer) {
			// the level 6 cells have noticible errors with non-geodesic lines - and the larger level 4 cells are worse
			// NOTE: we only draw two of the edges. as we draw all cells on screen, the other two edges will either be drawn
			// from the other cell, or be off screen so we don't care
			const region = L.polyline([corners[0], corners[1], corners[2], corners[3], corners[0]], {fill: false, color: color, opacity: opacity, weight: weight, clickable: false});

			regionLayer.addLayer(region);
		} else {
			corners.push(corners[0]);

			const line = new google.maps.Polyline({
				path: corners,
				geodesic: true,
				strokeColor: color,
				strokeOpacity: opacity,
				strokeWeight: weight,
				map: map
			});
			gmapItems.push(line);
		}
	}

	function fillCell(cell, color, opacity) {
		// corner points
		const corners = cell.getCornerLatLngs();

		if (regionLayer) {
			const region = L.polygon(corners, {color: color, fillOpacity: opacity, weight: 0});
			regionLayer.addLayer(region);
		} else {
			const polygon = new google.maps.Polygon({
				path: corners,
				geodesic: true,
				fillColor: color,
				fillOpacity: opacity,
				strokeWeight: 0,
				map: map
			});
			gmapItems.push(polygon);
		}
	}

	/**
	*	Writes a text in the center of a cell
	*/
	function writeInCell(cell, text) {
		// center point
		let center = cell.getLatLng();

		if (regionLayer) {
			let marker = L.marker(center, {
				icon: L.divIcon({
					className: 's2check-text',
					iconAnchor: [25, 5],
					iconSize: [50, 10],
					html: text
				}),
				interactive: false
			});
			// fixme, maybe add some click handler

			regionLayer.addLayer(marker);
		} else {
			const point = new google.maps.LatLng(center.lat, center.lng);
			const label = new Label({position: point, text: text, map: map, className: 's2check-text'});
			gmapItems.push(label);

		}
	}

	initS2checker();

	/*eslint-disable */
	// ELabel
	// http://blog.mridey.com/2009/09/label-overlay-example-for-google-maps.html
	function Label(b){this.setValues(b);var a=this.span_=document.createElement("span");a.style.cssText="white-space:nowrap; border:1px solid #999; padding:2px; background-color:white";if(b.className) a.className=b.className;var c=this.div_=document.createElement("div");c.appendChild(a); c.style.cssText="position: absolute; display: none"}
	function initializeLabels(){Label.prototype=new google.maps.OverlayView;Label.prototype.onAdd=function(){var b=this.getPanes().overlayLayer;b.appendChild(this.div_)};
	Label.prototype.onRemove=function(){
		if (this.div_.parentNode) 
			this.div_.parentNode.removeChild(this.div_);
		if (this.listeners_) {
			for(var b=0,a=this.listeners_.length;b<a;++b){google.maps.event.removeListener(this.listeners_[b])}
		}
	};
	Label.prototype.draw=function(){var b=this.getProjection(),a=b.fromLatLngToDivPixel(this.get("position")),c=this.div_;c.style.left=a.x+"px";c.style.top=a.y+"px";c.style.display="block";this.span_.innerHTML=this.get("text").toString()}}
	/*eslint-enable */
})();




