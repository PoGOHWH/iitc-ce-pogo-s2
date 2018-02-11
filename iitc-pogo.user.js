// ==UserScript==
// @id             iitc-plugin-pogo
// @name           IITC plugin: pogo for portals
// @category       Controls
// @version        0.4
// @description    Mark Ingress portals as a pokestop or gym in Pokemon Go. 
// @include        https://www.ingress.com/intel*
// @include        https://ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          https://ingress.com/intel*
// @include        https://www.ingress.com/mission/*
// @match          https://www.ingress.com/mission/*
// @grant          none
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */

/* globals $, L, GM_info, plugin, dialog */
/* globals renderPortalDetails, findPortalGuidByPositionE6 */

;(function () {	// eslint-disable-line no-extra-semi
	'use strict';

	const plugin_info = {};
	if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
		plugin_info.script = {
			version: GM_info.script.version,
			name: GM_info.script.name,
			description: GM_info.script.description
		};
	}

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

	// ensure plugin framework is there, even if iitc is not yet loaded
	if (typeof window.plugin !== 'function') {
		window.plugin = function () {};
	}

	// PLUGIN START ////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////

	let pokestops = {};
	let gyms = {};

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

	/***************************************************************************************************************************************************************/

	window.plugin.pogo.findByGuid = function (guid) {
		if (gyms[guid]) {
			return {'type': 'gyms', 'store': gyms};
		}
		if (gyms[guid]) {
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
							guid = findPortalGuidByPositionE6(lat, lng);
							if (!guid) {
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
			window.plugin.pogo.createStorage();
			window.plugin.pogo.loadStorage();
			window.plugin.pogo.updateStarPortal();
			window.plugin.pogo.resetAllMarkers();
			window.plugin.pogo.optAlert('Successful. ');
		}
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
				iconUrl: 'data:image/png;base64,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',
				iconAnchor: [15, 40],
				iconSize: [30, 40]
			};
		}
		const star = L.marker([lat, lng], {
			title: name,
			icon: L.icon(iconData)
		});
		window.registerMarkerForOMS(star);
		star.on('spiderfiedclick', function () { renderPortalDetails(guid); });

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

