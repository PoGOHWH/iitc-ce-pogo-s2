// ==UserScript==
// @name         S2 Check
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Find S2 properties
// @author       someone
// @match        https://gymhuntr.com/*
// @match        https://gomap.eu/*
// @grant        none
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */
/* globals L, S2, map */

(function () {
	'use strict';

	/* eslint-disable */
	/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */
	var saveAs=saveAs||function(e){"use strict";if(typeof navigator!=="undefined"&&/MSIE [1-9]\./.test(navigator.userAgent)){return}var t=e.document,n=function(){return e.URL||e.webkitURL||e},r=t.createElementNS("http://www.w3.org/1999/xhtml","a"),i="download"in r,o=function(e){var t=new MouseEvent("click");e.dispatchEvent(t)},a=/Version\/[\d\.]+.*Safari/.test(navigator.userAgent),f=e.webkitRequestFileSystem,u=e.requestFileSystem||f||e.mozRequestFileSystem,s=function(t){(e.setImmediate||e.setTimeout)(function(){throw t},0)},c="application/octet-stream",d=0,l=500,w=function(t){var r=function(){if(typeof t==="string"){n().revokeObjectURL(t)}else{t.remove()}};if(e.chrome){r()}else{setTimeout(r,l)}},p=function(e,t,n){t=[].concat(t);var r=t.length;while(r--){var i=e["on"+t[r]];if(typeof i==="function"){try{i.call(e,n||e)}catch(o){s(o)}}}},v=function(e){if(/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(e.type)){return new Blob(["\ufeff",e],{type:e.type})}return e},y=function(t,s,l){if(!l){t=v(t)}var y=this,m=t.type,S=false,h,R,O=function(){p(y,"writestart progress write writeend".split(" "))},g=function(){if(R&&a&&typeof FileReader!=="undefined"){var r=new FileReader;r.onloadend=function(){var e=r.result;R.location.href="data:attachment/file"+e.slice(e.search(/[,;]/));y.readyState=y.DONE;O()};r.readAsDataURL(t);y.readyState=y.INIT;return}if(S||!h){h=n().createObjectURL(t)}if(R){R.location.href=h}else{var i=e.open(h,"_blank");if(i==undefined&&a){e.location.href=h}}y.readyState=y.DONE;O();w(h)},b=function(e){return function(){if(y.readyState!==y.DONE){return e.apply(this,arguments)}}},E={create:true,exclusive:false},N;y.readyState=y.INIT;if(!s){s="download"}if(i){h=n().createObjectURL(t);r.href=h;r.download=s;setTimeout(function(){o(r);O();w(h);y.readyState=y.DONE});return}if(e.chrome&&m&&m!==c){N=t.slice||t.webkitSlice;t=N.call(t,0,t.size,c);S=true}if(f&&s!=="download"){s+=".download"}if(m===c||f){R=e}if(!u){g();return}d+=t.size;u(e.TEMPORARY,d,b(function(e){e.root.getDirectory("saved",E,b(function(e){var n=function(){e.getFile(s,E,b(function(e){e.createWriter(b(function(n){n.onwriteend=function(t){R.location.href=e.toURL();y.readyState=y.DONE;p(y,"writeend",t);w(e)};n.onerror=function(){var e=n.error;if(e.code!==e.ABORT_ERR){g()}};"writestart progress write abort".split(" ").forEach(function(e){n["on"+e]=y["on"+e]});n.write(t);y.abort=function(){n.abort();y.readyState=y.DONE};y.readyState=y.WRITING}),g)}),g)};e.getFile(s,{create:false},b(function(e){e.remove();n()}),b(function(e){if(e.code===e.NOT_FOUND_ERR){n()}else{g()}}))}),g)}),g)},m=y.prototype,S=function(e,t,n){return new y(e,t,n)};if(typeof navigator!=="undefined"&&navigator.msSaveOrOpenBlob){return function(e,t,n){if(!n){e=v(e)}return navigator.msSaveOrOpenBlob(e,t||"download")}}m.abort=function(){var e=this;e.readyState=e.DONE;p(e,"abort")};m.readyState=m.INIT=0;m.WRITING=1;m.DONE=2;m.error=m.onwritestart=m.onprogress=m.onwrite=m.onabort=m.onerror=m.onwriteend=null;return S}(typeof self!=="undefined"&&self||typeof window!=="undefined"&&window||this.content);if(typeof module!=="undefined"&&module.exports){module.exports.saveAs=saveAs}else if(typeof define!=="undefined"&&define!==null&&define.amd!=null){define([],function(){return saveAs})}
	/* eslint-enable */

	window.pokestops = {};
	window.pokegyms = {};

	let gridLevel = 14;
	let regionLayer;
	let highlightGymCandidateCells = true;

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
			const gymSummary = cellData.gyms.map(gym => '<a data-lat="' + gym.lat + '" data-lng="' + gym.lng + '">' + gym.name.substr(0, 20) + '</a>').join(', ');
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

			// is it on the screen?
			const corners = cell.getCornerLatLngs();
			const cellBounds = L.latLngBounds([corners[0],corners[1]]).extend(corners[2]).extend(corners[3]);
			if (cellBounds.intersects(bounds)) {
				filtered[cellId] = cellData;
			}
		});
		return filtered;
	}

	function groupByCell(level) {
		const cells = {};
		const pokegyms = window.pokegyms;
		Object.keys(pokegyms).forEach(id => {
			const gym = pokegyms[id];
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
		const pokestops = window.pokestops;
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
			dialog.style.display = (dialog.style.display == 'none') ? 'block' : 'none';
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
		const data = {gyms: window.pokegyms, pokestops: window.pokestops};
		const blob = new Blob([JSON.stringify(data)], {
			type: 'text/plain;charset=utf-8'
		});
		saveAs(blob, filename);
	}

	function addDialog() {
		const html = `
			<h3>S2 Cells</h3>
			<p>Select the level of grid to display: <select>
			<option value=0>None</option>
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
			<p><button class="btn btn-primary" id="save-json"><i class="fa fa-save"></i> Save Gyms and Stops as JSON</button></p>
			<p><button class="btn btn-primary" id="show-summary"> Show Analysis</button>
			 `;

		const div = insertDialogTemplate(html, 's2dialog');

		div.querySelector('#save-json').addEventListener('click', e => saveGymStopsJSON());
		div.querySelector('#show-summary').addEventListener('click', e => analyzeData());
		const select = div.querySelector('select');
		select.value = gridLevel;
		select.addEventListener('change', e => {
			gridLevel = parseInt(select.value, 10);
			updateMapGrid();
		});
		const chkHighlight = div.querySelector('#chkHighlightCandidates');
		chkHighlight.checked = highlightGymCandidateCells;
		chkHighlight.addEventListener('change', e => {
			highlightGymCandidateCells = chkHighlight.checked;
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
			map.panTo(new L.LatLng(lat, lng));
		});
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

		const origOpen = XMLHttpRequest.prototype.open;
		// add our handler as a listener to every XMLHttpRequest
		XMLHttpRequest.prototype.open = function () {
			this.addEventListener('load', function (xhr) {
				let json;
				if (this.responseText.indexOf('gyms') > 0) {
					json = JSON.parse(this.responseText);
					const gyms = json.gyms;
					gyms.forEach(function (gym) {
						const pokegym = JSON.parse(gym);
						const id = pokegym.gym_id;
						if (window.pokegyms[id]) {
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
						window.pokegyms[id] = data;
					});
				}
				if (this.responseText.indexOf('pokestops') > 0) {
					if (!json) {
						json = JSON.parse(this.responseText);
					}
					const stops = json.pokestops;
					stops.forEach(function (stop) {
						const pokestop = JSON.parse(stop);
						const id = pokestop.pokestop_id;
						if (window.pokestops[id]) {
							return;
						}
						// coordinates seem reversed
						const data = {
							guid: pokestop.pokestop_id,
							lat: pokestop.longitude,
							lng: pokestop.latitude
						};
						computeCells(data);
						window.pokestops[id] = data;
					});
				}
			});
			origOpen.apply(this, arguments);
		};
		showButton(document.querySelector('.controls'));
		addDialog();
		//showSaveButton();
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
			`;
		const style = document.createElement('style');
		style.type = 'text/css';
		style.innerHTML = css;
		document.querySelector('head').appendChild(style);
	}

	function interceptGoMap() {
		const origOpen = XMLHttpRequest.prototype.open;
		// add our handler as a listener to every XMLHttpRequest
		XMLHttpRequest.prototype.open = function () {
			this.addEventListener('load', function (xhr) {
				let json;
				if (this.responseText.indexOf('gyms') > 0) {
					json = JSON.parse(this.responseText);
					const gyms = json.gyms;
					gyms.forEach(function (pokegym) {
						const id = pokegym.gym_id;
						if (window.pokegyms[id]) {
							return;
						}
						// gym_id is not a real guid
						const data = {
							name: pokegym.name,
							lat: pokegym.latitude,
							lng: pokegym.longitude
						};
						computeCells(data);
						window.pokegyms[id] = data;
					});
				}
				if ((json && json.pstops) || this.responseText.indexOf('pstops') > 0) {
					if (!json) {
						json = JSON.parse(this.responseText);
					}
					const stops = json.pstops;
					stops.forEach(function (pokestop) {
						const id = pokestop.id;
						if (window.pokestops[id]) {
							return;
						}
						const data = {
							lat: pokestop.latitude,
							lng: pokestop.longitude
						};
						computeCells(data);
						window.pokestops[id] = data;
					});
				}
			});
			origOpen.apply(this, arguments);
		};
		showButton(document.body);
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

	function initS2checker() {
		// No ads :-)
		const frame = window.frameElement;
		if (frame) {
			frame.parentNode.removeChild(frame);
		}

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

		if (document.location.hostname == 'gymhuntr.com' && document.querySelector('.controls')) {
			interceptGymHuntr();
		}
		if (document.location.hostname == 'gomap.eu') {
			interceptGoMap();
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
		regionLayer.clearLayers();

		const bounds = map.getBounds();
		const seenCells = {};
		const drawCellAndNeighbors = function (cell) {
			const cellStr = cell.toString();

			if (!seenCells[cellStr]) {
				// cell not visited - flag it as visited now
				seenCells[cellStr] = true;

				// is it on the screen?
				const corners = cell.getCornerLatLngs();
				const cellBounds = L.latLngBounds([corners[0],corners[1]]).extend(corners[2]).extend(corners[3]);

				if (cellBounds.intersects(bounds)) {
					// on screen - draw it
					drawCell(cell, 'orange');

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
		if (gridLevel >= 6 && (!highlightGymCandidateCells || gridLevel != 14)) {
			const cell = S2.S2Cell.FromLatLng (map.getCenter(), gridLevel);
			drawCellAndNeighbors(cell);
		}
		if (highlightGymCandidateCells) {
			updateCandidateCells();
		}	
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
		const drawCellAndNeighbors = function (cell) {
			const cellStr = cell.toString();

			if (!seenCells[cellStr]) {
				// cell not visited - flag it as visited now
				seenCells[cellStr] = true;

				// is it on the screen?
				const corners = cell.getCornerLatLngs();
				const cellBounds = L.latLngBounds([corners[0],corners[1]]).extend(corners[2]).extend(corners[3]);

				if (cellBounds.intersects(bounds)) {
					// on screen - draw it
					const cellData = allCells[cellStr];
					const missingStops = cellData ? computeMissingStops(cellData) : 2;
					switch (missingStops) {
						case 1:
							drawCell(cell, 'red');
							break;
						case 2:
							drawCell(cell, 'gold');
							break;
						case 3:
							drawCell(cell, 'yellow');
							break;
						case 0:
							fillCell(cell, 'black');
							break;
					}

					// and recurse to our neighbors
					const neighbors = cell.getNeighbors();
					for (let i = 0; i < neighbors.length; i++) {
						drawCellAndNeighbors(neighbors[i]);
		}
				}
			}
		};

		const cell = S2.S2Cell.FromLatLng(map.getCenter(), level);
		drawCellAndNeighbors(cell);
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

	function drawCell(cell, color) {
		// corner points
		const corners = cell.getCornerLatLngs();

		// the level 6 cells have noticible errors with non-geodesic lines - and the larger level 4 cells are worse
		// NOTE: we only draw two of the edges. as we draw all cells on screen, the other two edges will either be drawn
		// from the other cell, or be off screen so we don't care
		const region = L.polyline([corners[0], corners[1], corners[2], corners[3], corners[0]], {fill: false, color: color, opacity: 0.5, weight: 5, clickable: false});

		regionLayer.addLayer(region);
	}

	function fillCell(cell, color) {
		// corner points
		const corners = cell.getCornerLatLngs();

		// the level 6 cells have noticible errors with non-geodesic lines - and the larger level 4 cells are worse
		// NOTE: we only draw two of the edges. as we draw all cells on screen, the other two edges will either be drawn
		// from the other cell, or be off screen so we don't care
		const region = L.polyline([corners[0], corners[1], corners[2], corners[3], corners[0]], {fill: true, color: color, opacity: 0.4, weight: 1, clickable: false});

		regionLayer.addLayer(region);
	}

	initS2checker();
})();




// S2 extracted from Regions Plugin
// https://static.iitc.me/build/release/plugins/regions.user.js

/// S2 Geometry functions
// the regional scoreboard is based on a level 6 S2 Cell
// - https://docs.google.com/presentation/d/1Hl4KapfAENAOf4gv-pSngKwvS_jwNVHRPZTTDzXXn6Q/view?pli=1#slide=id.i22
// at the time of writing there's no actual API for the intel map to retrieve scoreboard data,
// but it's still useful to plot the score cells on the intel map


// the S2 geometry is based on projecting the earth sphere onto a cube, with some scaling of face coordinates to
// keep things close to approximate equal area for adjacent cells
// to convert a lat,lng into a cell id:
// - convert lat,lng to x,y,z
// - convert x,y,z into face,u,v
// - u,v scaled to s,t with quadratic formula
// - s,t converted to integer i,j offsets
// - i,j converted to a position along a Hubbert space-filling curve
// - combine face,position to get the cell id

//NOTE: compared to the google S2 geometry library, we vary from their code in the following ways
// - cell IDs: they combine face and the hilbert curve position into a single 64 bit number. this gives efficient space
//						 and speed. javascript doesn't have appropriate data types, and speed is not cricical, so we use
//						 as [face,[bitpair,bitpair,...]] instead
// - i,j: they always use 30 bits, adjusting as needed. we use 0 to (1<<level)-1 instead
//				(so GetSizeIJ for a cell is always 1)

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

