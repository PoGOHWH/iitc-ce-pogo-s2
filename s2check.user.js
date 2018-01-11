// ==UserScript==
// @name         S2 Check
// @namespace    http://tampermonkey.net/
// @version      0.5
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

	function analyzeData() {
		const cells = groupByCell(gridLevel);

		// Save data
		const filename = 'S2_' + gridLevel + '_' + new Date().getTime() + '.json';
		const blob = new Blob([JSON.stringify(cells)], {
			type: 'text/plain;charset=utf-8'
		});
		showCellSummary(cells);

		saveAs(blob, filename);
	}

	function showCellSummary(cells) {
		const keys = Object.keys(cells);
		const summary = [];
		summary.push('Total number of cells: ' + keys.length);
		let i = 1;
		keys.forEach(name => {
			const cell = cells[name];
			const gymSummary = cell.gyms.map(gym => gym.name.substr(0, 20)).join(', ');
			summary.push(i + ': ' + cell.stops.length + ' stops & ' + cell.gyms.length + ' gyms (' + gymSummary + ').');
			i++;
		});
		alert(summary.join('\r\n'));
	}

	function groupByCell(level) {
		const cells = {};
		const pokegyms = window.pokegyms;
		Object.keys(pokegyms).forEach(id => {
			const gym = pokegyms[id];
			const cell = window.S2.S2Cell.FromLatLng(gym, level);
			const cellId = cell.toString();
			if (!cells[cellId]) {
				cells[cellId] = {
					gyms: [],
					stops: []
				};
			}
			cells[cellId].gyms.push(gym);
		});
		const pokestops = window.pokestops;
		Object.keys(pokestops).forEach(id => {
			const pokestop = pokestops[id];
			const cell = window.S2.S2Cell.FromLatLng(pokestop, level);
			const cellId = cell.toString();
			if (!cells[cellId]) {
				cells[cellId] = {
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
		const html = `<div class="filter-box">
			  <div class="close-button"><i class="fa fa-times"></i></div>
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
			<!--
			  <div class="inner-filter">
				<div class="filteritem">
				  <div class="filterlevels">
				  <p>Show raids with level: </p>
				  <input name="0" id="filter-level0" type="checkbox"><label for="filter-pokestops">No Raids</label><br>
				  <input name="1" id="filter-level1" type="checkbox"><label for="filter-pokestops">Level 1</label><br>
				  </div>
				</div>
			  </div>
			-->
			<p><button class="btn btn-primary" id="save-json"><i class="fa fa-save"></i> Save Gyms and Stops as JSON</button>
			<button class="btn btn-primary" id="show-summary"> Show Analysis</button>
			  <!--<button class="btn btn-primary" id="save-filter">Save Filter</button> -->
			</div>`;

		const div = document.createElement('div');
		div.id = 's2dialog';
		div.className = 'filters';
		div.style.display = 'none';
		div.innerHTML = html;
		document.body.appendChild(div);

		div.querySelector('.close-button').addEventListener('click', e => div.style.display = 'none');
		div.querySelector('#save-json').addEventListener('click', e => saveGymStopsJSON());
		div.querySelector('#show-summary').addEventListener('click', e => analyzeData());
		const select = div.querySelector('select');
		select.value = gridLevel;
		select.addEventListener('change', e => {
			gridLevel = parseInt(select.value, 10);
			updateMapGrid();
		});
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
						// coordinates seem reversed
						window.pokegyms[pokegym.gym_id] = {
							guid: pokegym.gym_id,
							name: pokegym.gym_name,
							lat: pokegym.longitude,
							lng: pokegym.latitude
						};
					});
				}
				if (this.responseText.indexOf('pokestops') > 0) {
					if (!json) {
						json = JSON.parse(this.responseText);
					}
					const stops = json.pokestops;
					stops.forEach(function (stop) {
						const pokestop = JSON.parse(stop);
						// coordinates seem reversed
						window.pokestops[pokestop.pokestop_id] = {
							guid: pokestop.pokestop_id,
							lat: pokestop.longitude,
							lng: pokestop.latitude
						};
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
			#s2dialog {
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				z-index: 1000;
				background: rgba(0, 0, 0, .5);
				text-align: center;
			}

			#s2dialog  .filter-box {
				background: #fff;
				margin-top: 5%;
				padding: 10px;
				border-radius: 3px;
				display: inline-block;
				width: 350px;
				box-sizing: border-box;
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
						// gym_id is not a real guid
						window.pokegyms[pokegym.gym_id] = {
							name: pokegym.name,
							lat: pokegym.latitude,
							lng: pokegym.longitude
						};
					});
				}
				if ((json && json.pstops) || this.responseText.indexOf('pstops') > 0) {
					if (!json) {
						json = JSON.parse(this.responseText);
					}
					const stops = json.pstops;
					stops.forEach(function (pokestop) {
						window.pokestops[pokestop.id] = {
							lat: pokestop.latitude,
							lng: pokestop.longitude
						};
					});
				}
			});
			origOpen.apply(this, arguments);
		};
		showButton(document.body);
		addDialog();
		injectStyles();
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

	function initMap(map) {
		regionLayer = L.layerGroup();
		map.addLayer(regionLayer);
		map.on('moveend', updateMapGrid);
		updateMapGrid();
	}


	function updateMapGrid() {
		regionLayer.clearLayers();
		if (gridLevel < 6) {
			return;
		}

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
					drawCell(cell);

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

		if (zoom >= 5) {
			const cell = S2.S2Cell.FromLatLng (map.getCenter(), gridLevel);
			drawCellAndNeighbors(cell);
		}
		/*
		// the six cube side boundaries. we cheat by hard-coding the coords as it's simple enough
		const latLngs = [[45,-180], [35.264389682754654,-135], [35.264389682754654,-45], [35.264389682754654,45], [35.264389682754654,135], [45,180]];

		const globalCellOptions = {color: 'red', weight: 5, opacity: 0.5, clickable: false};

		for (let i = 0; i < latLngs.length - 1; i++) {
			// the geodesic line code can't handle a line/polyline spanning more than (or close to?) 180 degrees, so we draw
			// each segment as a separate line
			const poly1 = L.geodesicPolyline ([latLngs[i], latLngs[i + 1]], globalCellOptions);
			regionLayer.addLayer(poly1);

			//southern mirror of the above
			const poly2 = L.geodesicPolyline ([[-latLngs[i][0],latLngs[i][1]], [-latLngs[i + 1][0], latLngs[i + 1][1]]], globalCellOptions);
			regionLayer.addLayer(poly2);
		}

		// and the north-south lines. no need for geodesic here
		for (let i = -135; i <= 135; i += 90) {
			const poly = L.polyline ([[35.264389682754654, i], [-35.264389682754654, i]], globalCellOptions);
			regionLayer.addLayer(poly);
		}
		*/
	}


	function drawCell(cell) {
		// corner points
		const corners = cell.getCornerLatLngs();

		const color = cell.level == 10 ? 'gold' : 'orange';

		// the level 6 cells have noticible errors with non-geodesic lines - and the larger level 4 cells are worse
		// NOTE: we only draw two of the edges. as we draw all cells on screen, the other two edges will either be drawn
		// from the other cell, or be off screen so we don't care
		const region = L.polyline([corners[0],corners[1],corners[2]], {fill: false, color: color, opacity: 0.5, weight: 5, clickable: false});

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

	/*
	S2.S2Cell.prototype.getLatLng = function() {
		var st = IJToST(this.ij,this.level, [0.5,0.5]);
		var uv = STToUV(st);
		var xyz = FaceUVToXYZ(this.face, uv);

		return XYZToLatLng(xyz);
	};
	*/

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

