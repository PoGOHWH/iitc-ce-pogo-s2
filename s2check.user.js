// ==UserScript==
// @id           s2check@alfonsoml
// @name         S2 Check
// @category     Layer
// @namespace    http://tampermonkey.net/
// @downloadURL  https://gitlab.com/AlfonsoML/pogo-s2/raw/master/s2check.user.js
// @version      0.28
// @description  Find S2 properties
// @author       Alfonso M.
// @match        https://gymhuntr.com/*
// @match        https://gomap.eu/*
// @match        https://www.pokemongomap.info/*
// @match        https://www.ingress.com/intel*
// @match        https://ingress.com/intel*
// @match        https://www.ingress.com/mission/*
// @grant        none
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */
/* globals L, S2, map, google */
/* globals GM_info, $, plugin, dialog */
/* globals renderPortalDetails, findPortalGuidByPositionE6 */

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

	/**
	 * Saves a file to disk with the provided text
	 * @param {string} text - The text to save
	 * @param {string} filename - Proposed filename
	 */
	function saveToFile(text, filename) {
		if (typeof text != 'string') {
			text = JSON.stringify(text);
		}

		// http://stackoverflow.com/a/18197341/250294
		const element = document.createElement('a');
		// fails with large amounts of data
		// element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));

		// http://stackoverflow.com/questions/13405129/javascript-create-and-save-file
		const file = new Blob([text], {type: 'text/plain'});
		element.setAttribute('href', URL.createObjectURL(file));

		element.setAttribute('download', filename);

		element.style.display = 'none';
		document.body.appendChild(element);

		element.click();

		document.body.removeChild(element);
	}

	/**
	 * Prompts the user to select a file and then reads its contents and calls the callback function with those contents
	 * @param {Function} callback - Function that will be called when the file is read.
	 * Callback signature: function( {string} contents ) {}
	 */
	function readFromFile(callback) {
		const input = document.createElement('input');
		input.type = 'file';
		input.className = 'baseutils-filepicker';
		document.body.appendChild(input);

		input.addEventListener('change', function () {
			const reader = new FileReader();
			reader.onload = function () {
				callback(reader.result);
			};
			reader.readAsText(input.files[0]);
			document.body.removeChild(input);
		}, false);

		input.click();
	}


	let pokestops = {};
	let gyms = {};

	let regionLayer;
	let gmapItems = [];

	let settings = {
		highlightGymCandidateCells: false,
		highlightGymCenter: false,
		grids: [
			{
				level: 14,
				width: 5
			},
			{
				level: 0,
				width: 2
			}
		]
	};

	function saveSettings() {
		localStorage['s2check_settings'] = JSON.stringify(settings);
	}

	function loadSettings() {
		const tmp = localStorage['s2check_settings'];
		if (!tmp)
			return;
		try	{
			settings = JSON.parse(tmp);
		} catch (e) {
		}
	}

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
		const gridLevel = settings.grids[0].level;
		const allCells = groupByCell(gridLevel);

		const cells = filterByMapBounds(allCells);
		showCellSummary(cells);
	}

	function saveGridAnalysis(cells) {
		const gridLevel = settings.grids[0].level;
		const filename = 'S2_' + gridLevel + '_' + new Date().getTime() + '.json';
		saveToFile(JSON.stringify(cells), filename);
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
			if (point._latlng)
				return mapBounds.contains(point._latlng);

			return mapBounds.contains(L.latLng(point));
		}

		return mapBounds.contains(point);
	}

	function groupByCell(level) {
		const cells = {};
		Object.keys(gyms).forEach(id => {
			const gym = gyms[id];
			if (!gym.cells) {
				gym.cells = {};
			}
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
			if (!pokestop.cells) {
				pokestop.cells = {};
			}
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
		saveToFile(JSON.stringify(data), filename);
	}

	function saveCSV(allData, title) {
		const data = filterItemsByMapBounds(allData);
		const keys = Object.keys(data);
		const contents = keys.map(id => {
			const gym = data[id];
			return (gym.name ? gym.name.replace(/,/g, ' ') + ',' : '') + gym.lat + ',' + gym.lng;
		});
		const filename = title + '_' + new Date().getTime() + '.csv';

		saveToFile(contents.join('\n'), filename);
	}

	function configureGridLevelSelect(select, i) {
		select.value = settings.grids[i].level;
		select.addEventListener('change', e => {
			settings.grids[i].level = parseInt(select.value, 10);
			saveSettings();
			updateMapGrid();
		});
	}

	function addDialog() {
		const selectRow = `
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
			</select></p>`;
		const html = `
			<h3>S2 Cells</h3>` +
			selectRow +
			selectRow +
			`<p><label><input type="checkbox" id="chkHighlightCandidates">Highlight Cells that might get a Gym</label></p>
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
		const selects = div.querySelectorAll('select');
		for (let i = 0; i < 2; i++) {
			configureGridLevelSelect(selects[i], i);
		}

		// In gymhuntr the styles of the checkbox look reversed, checked is red and unchecked green.
		const reverseCheckbox = document.location.hostname == 'gymhuntr.com';
		const chkHighlight = div.querySelector('#chkHighlightCandidates');
		chkHighlight.checked = settings.highlightGymCandidateCells;
		if (reverseCheckbox) {
			chkHighlight.checked = !chkHighlight.checked;
		}
		chkHighlight.addEventListener('change', e => {
			settings.highlightGymCandidateCells = chkHighlight.checked;
			if (reverseCheckbox) {
				settings.highlightGymCandidateCells = !chkHighlight.checked;
			}
			saveSettings();
			updateMapGrid();
		});

		const chkHighlightCenters = div.querySelector('#chkHighlightCenters');
		chkHighlightCenters.checked = settings.highlightGymCenter;
		if (reverseCheckbox) {
			chkHighlightCenters.checked = !chkHighlightCenters.checked;
		}
		chkHighlightCenters.addEventListener('change', e => {
			settings.highlightGymCenter = chkHighlightCenters.checked;
			if (reverseCheckbox) {
				settings.highlightGymCenter = !chkHighlightCenters.checked;
			}
			saveSettings();
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
				z-index: 5000;
				background: rgba(0, 0, 0, .5);
				text-align: center;
			}

			.filters .filter-box {
				background: #fff;
				color: #000;
				margin-top: 5%;
				padding: 10px;
				border-radius: 3px;
				display: inline-block;
				width: 350px;
				max-width: 100%;
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
				color: #000;
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
			lat: parseFloat(marker.position.lat().toFixed(6)),
			lng: parseFloat(marker.position.lng().toFixed(6))
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

		loadSettings();

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

			if (!map.hasLayer(regionLayer)) 
				return;

		} else {
			gmapItems.forEach(item => item.setMap(null));
		}

		const bounds = map.getBounds();
		const seenCells = {};
		const drawCellAndNeighbors = function (cell, gridLevel, width) {
			const cellStr = cell.toString();

			if (!seenCells[cellStr]) {
				// cell not visited - flag it as visited now
				seenCells[cellStr] = true;

				if (isCellOnScreen(bounds, cell)) {
					// on screen - draw it
					drawCell(cell, colorScheme.level[gridLevel], width, 0.5);

					// and recurse to our neighbors
					const neighbors = cell.getNeighbors();
					for (let i = 0; i < neighbors.length; i++) {
						drawCellAndNeighbors(neighbors[i], gridLevel, width);
					}
				}
			}
		};

		// center cell
		const zoom = map.getZoom();
		if (zoom < 5) {
			return;
		}
		for (let i = 0; i < settings.grids.length; i++) {
			const grid = settings.grids[i];
			const gridLevel = grid.level;
			if (gridLevel >= 6 && gridLevel < (zoom + 2)) {
				const cell = S2.S2Cell.FromLatLng(getLatLngPoint(map.getCenter()), gridLevel);
				drawCellAndNeighbors(cell, gridLevel, grid.width);
			}
		}
		if (settings.highlightGymCandidateCells && 14 < (zoom + 2)) {
			updateCandidateCells();
		}	
		if (settings.highlightGymCenter && 20 < (zoom + 4)) {
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
			const region = L.polygon(corners, {color: color, fillOpacity: opacity, weight: 0, clickable: false});
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

	// ***************************
	// IITC code
	// ***************************
	
	const plugin_info = {};
	if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
		plugin_info.script = {
			version: GM_info.script.version,
			name: GM_info.script.name,
			description: GM_info.script.description
		};
	}

	// ensure plugin framework is there, even if iitc is not yet loaded
	if (typeof window.plugin !== 'function') {
		window.plugin = function () {};
	}

	// PLUGIN START ////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////

	// use own namespace for plugin
	window.plugin.pogo = function () {};

	const KEY_STORAGE = 'plugin-pogo';

	window.plugin.pogo.stopLayers = {};
	window.plugin.pogo.stopLayerGroup = null;
	window.plugin.pogo.gymLayers = {};
	window.plugin.pogo.gymLayerGroup = null;

	window.plugin.pogo.isSmart = undefined;

	/*********************************************************************************************************************/

	// Update the localStorage
	window.plugin.pogo.saveStorage = function () {
		localStorage[KEY_STORAGE] = JSON.stringify({gyms: gyms, pokestops: pokestops});
	};

	// Load the localStorage
	window.plugin.pogo.loadStorage = function () {
		const tmp = JSON.parse(localStorage[KEY_STORAGE]);	
		gyms = tmp.gyms;
		pokestops = tmp.pokestops;
	};

	window.plugin.pogo.createStorage = function () {
		if (!localStorage[KEY_STORAGE]) {
			window.plugin.pogo.saveStorage();
		}
	};
	
	window.plugin.pogo.createEmptyStorage = function () {
		gyms = {};
		pokestops = {};
		window.plugin.pogo.saveStorage();
	};

	/***************************************************************************************************************************************************************/

	window.plugin.pogo.findByGuid = function (guid) {
		if (gyms[guid]) {
			return {'type': 'gyms', 'store': gyms};
		}
		if (pokestops[guid]) {
			return {'type': 'pokestops', 'store': pokestops};
		}
		return null;
	};

	// Append a 'star' flag in sidebar.
	window.plugin.pogo.onPortalSelectedPending = false;
	window.plugin.pogo.onPortalSelected = function () {
		$('.pogoStop').remove();
		$('.pogoGym').remove();

		if (window.selectedPortal == null) {
			return;
		}

		if (!window.plugin.pogo.onPortalSelectedPending) {
			window.plugin.pogo.onPortalSelectedPending = true;

			setTimeout(function () { // the sidebar is constructed after firing the hook
				window.plugin.pogo.onPortalSelectedPending = false;

				$('.pogoStop').remove();
				$('.pogoGym').remove();

				// Prepend a star to mobile status-bar
				if (window.plugin.pogo.isSmart) {
					$('#updatestatus').prepend(plugin.pogo.htmlStar);
					$('#updatestatus .pogoStop').attr('title', '');
				}

				$('#portaldetails > h3.title').before(plugin.pogo.htmlStar);
				window.plugin.pogo.updateStarPortal();
			}, 0);
		}
	};

	// Update the status of the star (when a portal is selected from the map/pogo-list)
	window.plugin.pogo.updateStarPortal = function () {
		$('.pogoStop').removeClass('favorite');
		$('.pogoGym').removeClass('favorite');

		const guid = window.selectedPortal;
		// If current portal is into pogo: select pogo portal from portals list and select the star
		const pogoData = window.plugin.pogo.findByGuid(guid);
		if (pogoData) {
			if (pogoData.type === 'pokestops') {
				$('.pogoStop').addClass('favorite');
			}
			if (pogoData.type === 'gyms') {
				$('.pogoGym').addClass('favorite');
			}
		}
	};

	// Switch the status of the star
	window.plugin.pogo.switchStarPortal = function (type) {
		const guid = window.selectedPortal;

		// If portal is saved in pogo: Remove this pogo
		const pogoData = window.plugin.pogo.findByGuid(guid);
		if (pogoData) {
			delete pogoData.store[guid];
			const existingType = pogoData.type;

			window.plugin.pogo.saveStorage();
			window.plugin.pogo.updateStarPortal();
	
			if (existingType === 'pokestops') {
				const starInLayer = window.plugin.pogo.stopLayers[guid];
				window.plugin.pogo.stopLayerGroup.removeLayer(starInLayer);
				delete window.plugin.pogo.stopLayers[guid];
			}
			if (existingType === 'gyms') {
				const gymInLayer = window.plugin.pogo.gymLayers[guid];
				window.plugin.pogo.gymLayerGroup.removeLayer(gymInLayer);
				delete window.plugin.pogo.gymLayers[guid];
			}

			if (existingType !== type) {
				// Get portal name and coordinates
				const p = window.portals[guid];
				const ll = p.getLatLng();
				plugin.pogo.addPortalpogo(guid, ll.lat, ll.lng, p.options.data.title, type);
			}
		} else {
			// If portal isn't saved in pogo: Add this pogo
	
			// Get portal name and coordinates
			const portal = window.portals[guid];
			const latlng = portal.getLatLng();
			plugin.pogo.addPortalpogo(guid, latlng.lat, latlng.lng, portal.options.data.title, type);
		}
	};

	// Add portal
	plugin.pogo.addPortalpogo = function (guid, lat, lng, name, type) {
		// Add pogo in the localStorage
		const obj = {'guid': guid, 'lat': lat, 'lng': lng, 'name': name};
		if (type == 'gyms') {
			gyms[guid] = obj;
		} else {
			pokestops[guid] = obj;
		}

		window.plugin.pogo.saveStorage();
		window.plugin.pogo.updateStarPortal();

		window.plugin.pogo.addStar(guid, lat, lng, name, type);
	};

	/***************************************************************************************************************************************************************/
	/** OPTIONS ****************************************************************************************************************************************************/
	/***************************************************************************************************************************************************************/
	// Manual import, export and reset data
	window.plugin.pogo.manualOpt = function () {
		dialog({
			html: plugin.pogo.htmlSetbox,
			dialogClass: 'ui-dialog-pogoSet',
			title: 'PoGo Options'
		});
	};

	window.plugin.pogo.optAlert = function (message) {
		$('.ui-dialog .ui-dialog-buttonset').prepend('<p class="pogo-alert" style="float:left;margin-top:4px;">' + message + '</p>');
		$('.pogo-alert').delay(2500).fadeOut();
	};

	window.plugin.pogo.optExport = function () {
		saveToFile(localStorage[KEY_STORAGE], 'IITC-pogo.json');
	};

	window.plugin.pogo.optImport = function () {
		readFromFile(function (content) {
			try {
				const list = JSON.parse(content); // try to parse JSON first
				for (let type in list) {
					for (let idpogo in list[type]) {
						const item = list[type][idpogo];
						const lat = item.lat;
						const lng = item.lng;
						const name = item.name;
						let guid = item.guid;
						if (!guid) {
							guid = findPortalGuidByPositionE6(lat * 1E6, lng * 1E6);
							if (!guid) {
								console.log('portal guid not found', name, lat, lng);
								guid = idpogo;
							}
						}

						if (!plugin.pogo.findByGuid(guid)) {
							plugin.pogo.addPortalpogo(guid, lat, lng, name, type);
						}
					}
				}

				window.plugin.pogo.updateStarPortal();
				window.plugin.pogo.resetAllMarkers();
				window.plugin.pogo.optAlert('Successful. ');
			} catch (e) {
				console.warn('pogo: failed to import data: ' + e);
				window.plugin.pogo.optAlert('<span style="color: #f88">Import failed </span>');
			}
		});
	};

	window.plugin.pogo.optReset = function () {
		const promptAction = confirm('All pogo will be deleted. Are you sure?', '');
		if (promptAction) {
			delete localStorage[KEY_STORAGE];
			window.plugin.pogo.createEmptyStorage();
			window.plugin.pogo.updateStarPortal();
			window.plugin.pogo.resetAllMarkers();
			window.plugin.pogo.optAlert('Successful. ');
		}
	};

	window.plugin.pogo.findPortalChanges = function () {
		const portalsInView = filterItemsByMapBounds(window.portals);
		const stopsInView = filterItemsByMapBounds(pokestops);
		const gymsInView = filterItemsByMapBounds(gyms);

		// Compare data
		Object.keys(gymsInView).forEach(id => {
			if (portalsInView[id]) {
				delete portalsInView[id];
				delete gymsInView[id];
			}
		});

		Object.keys(stopsInView).forEach(id => {
			if (portalsInView[id]) {
				delete portalsInView[id];
				delete stopsInView[id];
			}
		});

		const keys = Object.keys(portalsInView);
		if (keys.length > 0) {
			// Ignore portals that are in the same cell that another one
			const level = 17;
			// All cells with pokemon items
			const allCells = groupByCell(level);

			keys.forEach(id => {
				const portal = window.portals[id];
				const cell = window.S2.S2Cell.FromLatLng(portal._latlng, level);
				const cellId = cell.toString();
				if (allCells[cellId]) {
					delete portalsInView[id];
				}
			});
		}


		// Create report
		const summary = [];
		summary.push('<p>Portals not in Pokemon:</p>');
		const portalKeys = Object.keys(portalsInView);
		if (portalKeys.length == 0) {
			summary.push('<p>-none-</p>');
		} else {
			summary.push('<table>');
			portalKeys.forEach(id => {
				const portal = portalsInView[id];
				const latlng = portal._latlng;
				summary.push('<tr><td><a onclick="selectPortalByLatLng(' + latlng.lat + ',' + latlng.lng + '); return false">' + portal.options.data.title + '</a></td>' +
					'</tr>');
			});
			summary.push('</table>');
		}

		summary.push('<p>Gyms not in Ingress:</p>');
		const gymKeys = Object.keys(gymsInView);
		if (gymKeys.length == 0) {
			summary.push('<p>-none-</p>');
		} else {
			summary.push('<table>');
			gymKeys.forEach(id => {
				const gym = gymsInView[id];
				summary.push('<tr><td>' + gym.name + '</td>' +
					'<td><a onclick="window.plugin.pogo.removeGym(\'' + id + '\', this); return false">Remove</a></td>' +
					'</tr>');
			});
			summary.push('</table>');
		}

		summary.push('<p>Pokestops not in Ingress:</p>');
		const stopKeys = Object.keys(stopsInView);
		if (stopKeys.length == 0) {
			summary.push('<p>-none-</p>');
		} else {
			summary.push('<table>');
			stopKeys.forEach(id => {
				const pokestop = stopsInView[id];
				summary.push('<tr><td><a onclick="map.panTo(new L.LatLng(' + pokestop.lat + ',' + pokestop.lng + ')); return false">' +
					pokestop.lat + ',' + pokestop.lng + '</a></td>' +
					'<td><a onclick="window.plugin.pogo.removePokestop(\'' + id + '\', this); return false">Remove</a></td>' +
					'</tr>');
			}); 
			summary.push('</table>');
		}

		dialog({
			html: summary.join(''),
			dialogClass: 'ui-dialog-pogoIngress',
			title: 'Compare results'
		});
	};

	window.plugin.pogo.removeGym = function (guid, link) {
		delete gyms[guid];
		window.plugin.pogo.saveStorage();
		window.plugin.pogo.updateStarPortal();
	
		const gymInLayer = window.plugin.pogo.gymLayers[guid];
		window.plugin.pogo.gymLayerGroup.removeLayer(gymInLayer);
		delete window.plugin.pogo.gymLayers[guid];

		const tr = link.parentNode.parentNode;
		tr.parentNode.removeChild(tr);
	};

	window.plugin.pogo.removePokestop = function (guid, link) {
		delete pokestops[guid];
		window.plugin.pogo.saveStorage();
		window.plugin.pogo.updateStarPortal();

		const starInLayer = window.plugin.pogo.stopLayers[guid];
		window.plugin.pogo.stopLayerGroup.removeLayer(starInLayer);
		delete window.plugin.pogo.stopLayers[guid];

		const tr = link.parentNode.parentNode;
		tr.parentNode.removeChild(tr);
	};

	/***************************************************************************************************************************************************************/
	/** POKEMON GO PORTALS LAYER ***********************************************************************************************************************************/
	/***************************************************************************************************************************************************************/
	window.plugin.pogo.addAllMarkers = function () {
		function iterateStore(store, type) {
			for (let idpogo in store) {
				const item = store[idpogo];
				const lat = item.lat;
				const lng = item.lng;
				const guid = item.guid;
				const name = item.name;
				window.plugin.pogo.addStar(guid, lat, lng, name, type);
			}
		}

		iterateStore(gyms, 'gyms');
		iterateStore(pokestops, 'pokestops');
	};

	window.plugin.pogo.resetAllMarkers = function () {
		for (let guid in window.plugin.pogo.stopLayers) {
			const starInLayer = window.plugin.pogo.stopLayers[guid];
			window.plugin.pogo.stopLayerGroup.removeLayer(starInLayer);
			delete window.plugin.pogo.stopLayers[guid];
		}
		for (let gymGuid in window.plugin.pogo.gymLayers) {
			const gymInLayer = window.plugin.pogo.gymLayers[gymGuid];
			window.plugin.pogo.gymLayerGroup.removeLayer(gymInLayer);
			delete window.plugin.pogo.gymLayers[gymGuid];
		}
		window.plugin.pogo.addAllMarkers();
	};

	window.plugin.pogo.addStar = function (guid, lat, lng, name, type) {
		let iconData;
		if (type === 'pokestops') {
			iconData = {
				iconUrl: 'data:image/png;base64,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',
				iconAnchor: [12, 32],
				iconSize: [24, 32]
			};
		}
		if (type === 'gyms') {
			iconData = {
				iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAoCAYAAADt5povAAAMNklEQVR4AY2UCVRUV7aGtzKACkZFRdSAyCBCMRQgIAiKiMo8KzLIYIHFAFWAxYAgMhTFXMwDDpiUYUBREcXBqN3EJD5jjEm6086iOEQxJq3tW+uln/2/U1c7nbdijLXWv+693HPPt//97wPt6VJQX+8AlRSVUHCgPxUVFFBxsZS2byuk2qqSiSHroqmz/yOr6pZWeVyy8KR7QOCNpWt9nlsvX/UPK+flz/iuy/7Gd7DbvS4i1LOivFilUlZCqampJC0rpbi4TRQZEUVyeS21tbdSY1MD/T9ggL8vVbCFO9saaUNELDV2K1aLi/JOCeJjkCVMRb20DrvaFejtO4y9vYexq6MbZdurERoSCRMrHmYu0Lvq4mKfkC0RUXtjDQMKKGLDm4HMUQlFh4dQTfk26j96ZI6korQ/OjIGB7sPoqd3CDkFDXAPEMHALgJuwWKYucXBfFkc1guKUN+iwLGTIygprMD7JubwWOvxZXxC7HtZoiSKeJPD3p4Bqi6XklAQRR/uG3COkaQ/rSsuw+CRU1gRKAJpuYLI7tV19iqo6PuA5q4BTV8B0lgKIltoG/qgoLgVX17+FiGhcVhoa3l1c3KydVbaZqr7NfCDDz6iI0PD1FZfTf3HTzgGxEfhxP79yC5seAWZ5Awts2CoGfpCw8gPU82CoLrAB+rsWU2pBb7QWhQMmrcWROaYbxGMkfNfoCC7BEZ2Ni9T0kWOH+1po44dndTS2kzU0bqD9il20WeX/7IoOiPt5cm+HgRsyAERD6oGPpi2OASTjQOhvvDV5pOM/JVg9s6bgYK4Z+5vC1kxFiGgGe6c62OnR5CelAVz56Uv2ztaTdpa5CRlXaTeD7soOGwjiStKP28ulSI+sxJEfExkMO1FgZhiEsBa6M050jINZPAA5T17F8QUDBUGpvlrWREBmG4eirn2kaDJy5ic8cXFS3B18YBHkP+VhppSqqmrJmqWy1Tkiq61Xh6rsPujQ1wbNVjFrF3MlR/nknPE7mm256vM1J1Ams7cVQld4BwDLWVh73thAtNksyAOaugYhW++/ha6Cy2RLBZvaq0tJ1rtH6G2frPg9nBvP6YrF2q7YpJJILRZbqrM2VTW0onz1nCFLHKJRWZZO4o7+rCtQYENwhJMXeiP6aYBmGO9HpqsKJYv1+KpzC2RJcrlXcjJlcE9LPh/FHu7tSkpN3eRn6sbqps+AJE11JWZGPtjMqtYk2ninNVcLuXVO7H386+Q396PwsJGSGQ7IBs8i/6Tn8DSKYo5d4IWK27Sq5ZzIh13zLRch+FjZ2Ftb4MEYdpa8omLkddkSuDgnQqasgxTWE6zLMPZgPgwaCCXRfPu/dhz4Wt4WfmjhmbjOE1DD1OSpgmic+sxcv0mHJbHQUNvNWZYrYMay1U5ROoMTqoO6Ojqh6/3OngEB7SQs+fK0a6GVtBcFrwha49FGPT4G1iFfiAVB0SnlKHny7/CYaodHtEUYJ4eMEkbmD4D0NWFjCZhY64c+858jok6HixHby73CfO9oK2MSHMpErMqUVzaBBdv33GytbP7587GTvbCkbnyZtWthZq+F/vICzRtOdoHP0aCoAA3SRXQn4/eyQaItvRBst4SPJ3G4Lo62KJuBOnhPyEwoYgbqmnmwdCxfOWUprrBNSgDra0K8Bxc/pf4POvntRXt3LkjnVUsr5Wv/7PwoWXkg4qhs4gycMN3RGhlCkuS4k9//xmV34whWpuHL4hQwpTFMt3e9CFogh10WJd0bcI5txNme8BihQDyhh3g2dk+J3Ozxf/YPfgpVmQdgn/JMfgVD2NN3iCWi/qRKD+Bus4euHsmYJtIBhPbUJR2Hca/f6YeQoii8xEZIELOtkYUy5SFGzFXjlCfvxKTF7JjMscDi93iUdvUBStbx+dkZc1/sXPwAhbH7oN9+mE4ZhzFMskpOGWfwZrSc5DW7EJmSRMHePIvICq5DEUljQiKzsPOfR8DAIYuXYcwbTu6hs7DzLcM+h6Z0LaOA+n5gcgKBvww7N57AGaW/Gdky+f/3HPozyDtjSDDZNBCJuXVIInlGo26rmEkibZhYPgzAMBPf3+OsvIW9A2e+cVpWHwhauo6sbHhU3hWfo3QpssIrb+EINlZrEjrRlrNIEqrWmHG4/1MRga6f+vuG4SmQy6IlwF1WwknDTsJaEEKeP4yDB09AXf/ZCgG/gPh4M9eICyhFLLKBsg/OMGyjwcZZ0FlSRFmesnBEw6Cn3UeXSP3EbIuFo7Ozs/I2tyoKS1DAu/kTtBcITTss6Fu90pqS3JBswUIE+3E8PBxCFILIM6uQW1jNwqlOyBIKkJlTQv2skI0eVkgkzSo8zOhapUOMk8BWWSBZmaivfs07B1dsdbXr5fclznwzM1McXzka9AMAVTtc14DJZzUbLNBswRwjazHrt7jKJW1ITuvCrkFtWjq7ENx0yGQmRhkmAoNh9xfitVg+9D8RPACSrB7Tw8MjRcjRZwZRHHxQk3dGVPO1dQ0wGZdLXMUD3WbdKjZZEJjSR73oToTvS8EGabAOrQGgaJdWL25He85F7D1CcxNxq9h3Ho1vgT0Xgz2HvoEvsERMLXgPamsrlSjFnn5hABfd6+5ujPx3dVREK8MtLQOU1Y3Y4p7HTSdtrNMt3BgFeUmxukMrhyqFA7ENmf6VQz8LGg4sUKMShCUux99vQcwQ2cW4hPiU8qK8ok+GTlDMmkZLXWy/9jPPwRnvhoDmdVBxUXOHOZwA8Q2enexb2jGJhj5ynHp8reYN38BlixxvH70QDcpFHuJ9uzZSwd6FdR7aGCuvr7hTylpGTh9/ipIXzkE2VxbWZZvhXBTbZsJsmDutWNh41eBixe/wtKlKzBBhV4Wl5YYnD19mvbvP0hUVVlHnR27qb6qjLJzs4wnqqg8q6ysx7W74zDwbmLVCkFGqVD5pWUZULUWsYzFULNO5+5JOaH6DGiUh4rOU7h4+Rt2DCJBRFgfFemr6NpFQ0PD1NfbT9RQ30zt7TspW5JDibERtMTRbhHRBAwcGsKLFy+we+AcjFeXstySQHrKwckEWUlBNlUgk0KQuRRqK9sQKzuNS1fv4srNO9iSWwRS1YCnt6csZn0INTW10ZGho/8BdjDgli055OfrT+VFObQhMjxzlu48fHflBgDg8l+v4OSfL6K97xy27vgU4tbz2NJ5AdV9X+HgyBV88e01jN5/gLGHj9Gl6IHWNB3wbGxG+w8OqAf4+VNL8xuAEgb08fajTJGYKksLaaXnqhOu7p54CeCn/36BK7dv4+bY2Bt1+/59PHgyjk8+vwBnV3fMmD0Hja3N9hHhkRTkH/D7QF8ffwYUUY5EQp07OybN0p09Wl5RAwC48+Ahbty9+xry+nr3Hm7cuYcHj37AjdF7yNlaDLVJWojYGL1NlJ5BkRveEZibnU0SlmlKaqqXoaEJvvnLdxz02ugobt2794szBmOtfISHj3/E0PBpGC+yhLOb6+P0dBGJRZlvBmbn5f5Gktwcyt2aT+WVFbTI3PxceEQUB3z4ww+4fucOg74CXmMO748/xfVbY0hOz8DU6TMhlkhWdSkUVNvQQHWNjb8RibLEvyMRZednU1qGyGLOnHk4eeo0ALzO8i5uMOB1NigPxn/EkWMfw5JvBxt7hzOxAiEFhq6noLDwN4ry8vPfoq1ULpORg6PTYEBgKAccf/qj0iWD3sG98ce4NfYQEslW6L2/AP4hoY7hUdEUvG49Ba8Pf6PYhpW/K2l5BdXJ66m4VGprYGDCXJ7hoFdv32IDM4rvf3yCc/91Ea4u7jBdzLsdl5hE4VExbxVtLSh8q/KZKqqqyM5+yUhs7CYOOPZ4HLcf3MO9R9+jrbMLhobGCAoOFUty8ik5VUQpab8vitoY/VZFRkdRvCCegkKCHa2t+bh2/Sb++S8GHf8eV27cRHxCMix4VqioqNJhIqlU9lZRolD4h9rMJBKLydTU7FZTc/vriX2Kzy5cxHKPNVju7nGgqqaW8rYWMBW+VbRJkPgOSmBnMp1cli3PCQuLwL9/Q8dOwsF5GQRJqX6lLPP8bcV/KBImp72TUtMzSJCYZDhf3xANLTvw/aMniN0kxELTxT+kZWxR2ZySTols3R+JImNi30kRMTGUkJRMTq5u8dNn6Y3ZOzr/ZGxmcdfZzZ0fEBJCnl7etNrb5w/1f7SBUbG3uYEfAAAAAElFTkSuQmCC',
				iconAnchor: [15, 40],
				iconSize: [30, 40]
			};
		}
		const star = L.marker([lat, lng], {
			title: name,
			icon: L.icon(iconData)
		});
		window.registerMarkerForOMS(star);
		star.on('spiderfiedclick', function () { 
			// don't try to render fake portals
			if (guid.indexOf('.') > -1) {
				renderPortalDetails(guid); 
			}
		});

		if (type === 'pokestops') {
			window.plugin.pogo.stopLayers[guid] = star;
			star.addTo(window.plugin.pogo.stopLayerGroup);
		}
		if (type === 'gyms') {
			window.plugin.pogo.gymLayers[guid] = star;
			star.addTo(window.plugin.pogo.gymLayerGroup);
		}
	};

	/***************************************************************************************************************************************************************/

	window.plugin.pogo.setupCSS = function () {
		$('<style>').prop('type', 'text/css').html(`
#sidebar #portaldetails h3.title{
	width:auto;
}
.pogoStop span, 
.pogoGym span {
	display:inline-block;
	float:left;
	margin:3px 1px 0 4px;
	width:16px;
	height:15px;
	overflow:hidden;
	background-repeat:no-repeat;
}
.pogoStop span, .pogoStop.favorite:focus span,
.pogoGym span, .pogoGym.favorite:focus span {
	background-position:left top;
}
.pogoStop:focus span, .pogoStop.favorite span,
.pogoGym:focus span, .pogoGym.favorite span {
	background-position:right top;
}

/**********************************************
	MOBILE
**********************************************/
#updatestatus .pogoStop{
	float:left;
	margin:-19px 0 0 -5px;
	padding:0 3px 1px 4px;
	background:#262c32;
}

/**********************************************
	DIALOG BOX
**********************************************/

/*---- Options panel -----*/
#pogoSetbox a{
	display:block;
	color:#ffce00;
	border:1px solid #ffce00;
	padding:3px 0;
	margin:10px auto;
	width:80%;
	text-align:center;
	background:rgba(8,48,78,.9);
}
#pogoSetbox a.disabled,
#pogoSetbox a.disabled:hover{
	color:#666;
	border-color:#666;
	text-decoration:none;
}

#pogoSetbox{
	text-align:center;
}
.pogoStop span {
	background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAPCAMAAACyXj0lAAACZFBMVEUAAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAQECAAAAAAAGAQEAAAAPDw8AAAAMAgIAAAALAQEBAQETAwMAAAAGBQUMAgISEhIAAAAWFhYBAQEWAwMAAAACAgIDAwMFBQUGBgYJCQkPDw8REREVGBgWFhYXFxchISEiIiIkICAoKCgpICAtLCwtLi4uBQUuKysuLy8vEBAvMjEyMDAzMzM0NDQ4ODg5OTk6Ojo+Pj5AQUFBS0tCSEhDQ0NISEhJSUlMTExSUlJUVFRWVlZXV1dYCwtZCwtaWlpcXFxeXl5gYGBhBgZiYmJjY2NlDAxmDAxnZ2doaGhra2tsbGxtbW1wcHBwfHtxcXFycnJ0dHR1dXV2dnZ4CQl5eXl9fX2CgoKEhISFhYWGhoaIiIiIiomJh4qKioqLi4uMjIyNjY2PiZCQkJCUlJSXBASaERGanJycBAScnJytFRWuDg6urq6wFBS2wcG3t7e4FRW5t7q6Cwu6urq7Dg6+vr7CwsLDwMTEDg7FxcXHxsfIyMjJFxfKDw/MDg7MzMzPz8/P0NDQ0NDRDw/RFxfS09XX19faGBja2trbExPc3NzlGhrl5eXo6Ojs7u7u7u7vGxvwGhrw8PDyGhry8vLz8/P0Ghr3Gxv39/f4+Pj8/Pz8/v79/f3+////HBz/HR3/Hh7///9j6e8DAAAAPnRSTlMAAAIKDBIWGBshJTI0O0tQY2VocnN1fImVnZ6lqKmrrLCxs7u8vb3G0tbW1tra39/i4uXl7Ozv7+/v8fH6+jTKPt8AAAGeSURBVHgBYwACZiFlAxMdWT4Qm5ERImBoqgsUgAAeDfe8hsbaZEd5VpACkED6rK27Nk4IAAoAAbdZVldXd3dXV5OXOgtIAbfFlFMnT5w4eXJ3IVCAgVkzGywNJJo9JIAKmLWnnwJJA9XszZBgYBD0AEp1F2fWd3W3VtpwMTIKZgDlT8yZtPnUiYPrbLkYVEuBuj3t7OxyurpbPEUYGdWWnTp5MjeuwnfqqRMHCkQYjIoqK9Psqu2jHapqyiKlGRmN5y1f3h+7vn1G8Iq1i+qkGczsgMDewS7JDgSUGBnN/fyD3Np67BaG+IUGeisx6M0/fbrELjXK0e7QsfkukoyM+jtOn17ts2R2d8zR4zsmSjIoRJ8+fdoVqLn59LYFdgKMjApzgQKTw+KjN50+vDNPgIHf7jQQLO0EEqvyzdgYGfkTQAJ7tgCJfSst2RiYVJxPQ8E0O2FgODCp9MEEticKA0OSQ9NhP5jbYCcFDmoOrY4jYIENSVLguGCXs3NKKY2wsxIDRxZIILx38ZqZ5dZAAQjgFVdUlhHlhMQmmgAAN4GpuWb98MUAAAAASUVORK5CYII=);
}
.pogoGym span {
	background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAPCAMAAACyXj0lAAAC7lBMVEUAAAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEAAAAAAAAAAAAAAAAAAAABAQEAAAABAQEBAQEAAAAAAAAAAAAAAAAAAAADAwMAAAAAAAABAQIAAAAAAAAAAAAAAAAAAAACAgIAAAAAAAABAAAAAAAAAAAAAAAAAAACAgIAAAAHBwcAAAACAgIAAAAbBgYBAQEBAQEZBgcAAAAAAAAAAAABAQEXFxcCAgICAgIHBAUBAQEGBgdyFRcRERFsFRYCAgIDAwMFBQUODg4EBAQFBQUREREFBQUGBgYTExMRCQoEBAQGBAVcIiYaGhoaGhsFBQUUFBRaJSgGBgYdFBgDAwMEBAQNDQ0ODg4fHyAjIyNYWFheLTEHBgcHBwgJCQkLCwsNDQ0PDw8RERESEhIUFBQVFRYWFhYXFxcYGBgZGRkZGRoaGhocHBwdHR0eHh4eHx8fHx8iIiIlJSUmJiYnJycpKSkqKiotLS0uLi4uLi8wMDAyMjIzMzM0NDQ2NjY4ODg6Ojo7Ozs7Oz09PT4+Pj4/Pz9DKS9DQ0NJSUpLS0xMTE1NTU1PT09QUFBRUVFSUlNXV1dZWVlbW1tcXFxeXl5eXl9jY2NkZGRmZmZoaGlsbG1wcHBycnJ1dXV7e3t/f3+AgYGBgYGFhYWIh4mPj4+THyGTk5SVlZWYmJqbm5ygoKCnp6irq6uvr6+wr7KwsLGxsbO1tbW3tri4t7m5ubu9HyDGxcjGxsfJJyjOzs7PHR7QIyTQ0NDR0dHSICHS0tLU1NTY2NjZ2dndIiPd3d3e3t7fIyTi4uLj4+PnICHn5+jq6urs6+zs7Ozu7u7w8PDw8PHx8fHx8fLy8fLy8vLzHR329vb29vf39/j4+Pj5+fn6Hh76Hx/7+/v7+/z8Hx/8/Pz8/P39Hh79/f3///+f+BszAAAAcXRSTlMAAAECAwQFBwoPFhskJSYqKy4yMzU4OTw/Q0hRW1xjZGVmb294e3+Fi4+QkZibnaWmqq+2t7m+x8nKzM3Oz9HR19fd3d/h4eLk5ebm5+rq7O7v8PDy8vP09fX19/f3+Pn5+fr6/Pz8/f3+/v7+/v7+/k5HHiYAAAGUSURBVHgBY2BkFHMMizAVYmRk5NLSVAJSUg5uwYHOlmIMjFzq+soMbHrZ3WsWNyfJ8Gh7pOTxMjJKW6fd/v79S6IFn4FXciUvg3HNoqXNk5Y3ZcXXLSrVBRooW3Dvw/lTr75nZM7Yvd6dgcF37YqGxTOrayZsubkgkpOBkd3v7MddLX2zL7cef3srSoWBIWh1z6yL2zo2XH9wpRLIZeSKu3Bj4uGj03tOv/+60IaBgSG0cWrnypldO5+8nubPDLSBI6GwpGje5KoDn3/uCxAEKvBctH9Oe+/GOy83lykyABUw+aw7sbV/yt4XPx83aTEAgXzxwSeX7t78ca3DDiTPyKBQsePd/YfPP71f5crGAAJGOduP3X3/aHW6AEQBg1ru3DM/fn47kioHFACpMHSy3/PsULc5SB6sQtI2Ov/pm2UeDEAREGLRsPK+uilaAqoApEku/NzJWHGQAASLurd1m4CYcBUuS+abQW0E8xXLQ4RBTLgS1foYfpgCEClSqwFiIYBIqzZEACrMrceKqoBbhxmqAAABho1+nW2udAAAAABJRU5ErkJggg==);
}

i.fa.fa-times:before {
    content: 'x';
    font-style: normal;
}
`).appendTo('head');
	};

	window.plugin.pogo.setupContent = function () {
		plugin.pogo.htmlStar = '<a class="pogoStop" accesskey="p" onclick="window.plugin.pogo.switchStarPortal(\'pokestops\');return false;" title="Mark this portal as a pokestop [p]"><span></span></a><a class="pogoGym" accesskey="g" onclick="window.plugin.pogo.switchStarPortal(\'gyms\');return false;" title="Mark this portal as a PokeGym [g]"><span></span></a>';
		plugin.pogo.htmlCallSetBox = '<a onclick="window.plugin.pogo.manualOpt();return false;">PoGo Opt</a>';

		let actions = '';
		actions += '<a onclick="window.plugin.pogo.optReset();return false;" title="Deletes all Pokemon Go markers">Reset PoGo portals</a>';
		//actions += '<a onclick="window.plugin.pogo.optCopy();return false;" title="Get data of all Pokemon Go markers">Copy PoGo portals</a>';
		//actions += '<a onclick="window.plugin.pogo.optPaste();return false;" title="Add Pokemon Go markers to the map">Paste PoGo portals</a>';

		actions += '<a onclick="window.plugin.pogo.optImport();return false;">Import pogo</a>';
		actions += '<a onclick="window.plugin.pogo.optExport();return false;">Export pogo</a>';

		actions += '<a onclick="window.plugin.pogo.findPortalChanges();return false;" title="Check for portals that have been added or removed">Find portal changes</a>';

		plugin.pogo.htmlSetbox = '<div id="pogoSetbox">' + actions + '</div>';
	};

	/***************************************************************************************************************************************************************/

	const setup = function () {

		window.plugin.pogo.isSmart = window.isSmartphone();

		// If the storage not exists or is a old version
		window.plugin.pogo.createStorage();

		// Load data from localStorage
		window.plugin.pogo.loadStorage();
		window.plugin.pogo.setupContent();
		window.plugin.pogo.setupCSS();

		$('#toolbox').append(window.plugin.pogo.htmlCallSetBox);

		window.addHook('portalSelected', window.plugin.pogo.onPortalSelected);

		// Layer - pokemon go portals
		window.plugin.pogo.stopLayerGroup = new L.LayerGroup();
		window.addLayerGroup('PokeStops', window.plugin.pogo.stopLayerGroup, true);
		window.plugin.pogo.gymLayerGroup = new L.LayerGroup();
		window.addLayerGroup('Gyms', window.plugin.pogo.gymLayerGroup, true);
		window.plugin.pogo.addAllMarkers();


		//showButton(document.getElementById('toolbox'));
		const button = document.createElement('a');
		button.textContent = 'S2 Grid';
		button.title = 'Find S2 distribution';
		document.getElementById('toolbox').appendChild(button);

		button.addEventListener('click', e => {
			if (window.isSmartphone()) window.show('map');
			const dialog = document.getElementById('s2dialog');
			dialog.style.display = dialog.style.display == 'none' ? 'block' : 'none';
		});

		addDialog();
		injectStyles();

		regionLayer = L.layerGroup();
		window.addLayerGroup('S2 Grid', regionLayer, true);
		map.on('moveend', updateMapGrid);
		updateMapGrid();

	};

	// PLUGIN END //////////////////////////////////////////////////////////

	setup.info = plugin_info; //add the script info data to the function as a property
	if (!window.bootPlugins) {
		window.bootPlugins = [];
	}
	window.bootPlugins.push(setup);
	// if IITC has already booted, immediately run the 'setup' function
	if (window.iitcLoaded && typeof setup === 'function') {
		setup();
	}
})();
