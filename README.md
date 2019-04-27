This is script to that tries to help finding out info about Pokestops and Gyms in Pokemon Go. Is is a plugin for IITC to run in https://ingress.com/intel, you need an Ingress account and IITC already installed. 

Check [this post](https://www.reddit.com/r/TheSilphRoad/comments/9fn61y/tutorial_pogo_s2_plugin_for_ingress_intel/) to learn how to install and configure it. I'm gonna write my own description below, just follow whatever steps you find easier.

**Pre-requisites**
  1. An Ingress account. You don't have to play the game, just install it once and create and account, after you have everything configured you can un-install the game if you want to.
  2. Verify that you can login in https://intel.ingress.com
  3.
* For PC, install [Tampermonkey](https://tampermonkey.net/) on your browser of choice. Then install [IITC](https://static.iitc.me/build/release/total-conversion-build.user.js) or [IITC-CE](https://iitc.modos189.ru/build/release/total-conversion-build.user.js)
* For Android install IITCm (either [classic](https://static.iitc.me/build/release/IITC_Mobile-release.apk) or the updated [IIITC-CE](https://play.google.com/store/apps/details?id=org.exarhteam.iitc_mobile))
* For iOS install IITC-Mobile
4. Load again https://intel.ingress.com (or open the mobile app) and check that it works. You can enable the Google Satellite view to switch to a map easier to understand. You can also install and enable the "OpenStreetMap.org map tiles" plugin.
 
**Install**  
[Click on this link](https://gitlab.com/AlfonsoML/pogo-s2/raw/master/s2check.user.js). If your browser prompts you to Install it confirm and then reload the Ingress Intel page. If you're on mobile you might be prompted to save it. In Android open IITCm go to settings, plugins and add a new one by picking the file that you have saved. In iOS you can install it by pasting the url after clicking the add plugin and then you have to enable it.

**Features**  
In IITC there are two links added to the side pane, one shows the actions available with the Pokemon data and the other allows you to change the settings of the plugin.
 
Settings dialog:
  1. Draw an overlay of two S2 cells levels (usually 14 and 17)
  2. Cover the level 17 cells where there is already a pokestop or gym, and if the L14 cell has already 3 gyms then it fills all of it with a dark color. In the center of the L14 cells will show the number of portals that must be added to that cell to get a new Gym. Also, draw a 20m circle around existing portals where no new portal will get approved. "Highlight Cells that might get a Gym" setting.
  3. Ability to check for updated data and suggest the addition of new Pokestops or Gyms when new Portals are detected, as well as movements or removals or portals. "Analyze portal data" setting
  4. Disable most of the features of Intel that aren't relevant to Pokemon (fields, links, portal ownership, chat...) with the "This is PoGo!" setting
  5. Configurable colors
  
Actions dialog
  1. Export all the portals and gyms data in JSON.
  2. Export the gyms and pokestops data as CSV to use it in any place where they expect that format (Overpass turbo, import to Google sheet for raid bots, ...)
  3. Reset all the data. In case something goes wrong (maybe incompatibility with another Pokemon Go plugin) test by clicking this option and reloading intel. If you have other IITC plugins for PoGo you should try to disable them if there are problems, this plugin includes everything that it's needed.  
  4. Import/Export the whole data for backups or to use in anothe device


Coloring of cells.  
When the Highlight cells that might get a Gym is selected, the L17 cells will be covered with a dark pattern, and L14 cells that have 3 gyms will be also darker so you can focus your efforts in other locations when requesting new portals.  
If a cell has enough portals but you have forgot to mark one of the stops as gyms the L14 cell will be marked as orange and in case that there are more gyms than expected then it will be red.
 
Adding Pokestops/Gyms  
When you select a portal, in the sidebar there will be two little icons of a pokeball and a gym so you can mark this portal as a Pokestop or Gym.  

**Analyze portal data**
If this setting is enabled, the plugin will try detect changes in the existing portals and so it will show some messages ("New pokestops X", "Review required X", "Moved portals X", ...) and clicking on those numbers will display a dialog trying to explain the detected changes. Hovering on the photos or locations will display a blinking marker on the map, clicking on them will center the map on them (and they might end up below the dialog, so move it afterwards to check the location)

**Updates**
I'll try to publish announcements about changes and how to use the features in https://twitter.com/PogoCells so follow that account, it won't have too many posts and all of them focused on this plugin or very related things (but not news about Pokémon Go in general)
