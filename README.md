This is script for Tampermonkey to that tries to help finding out info about Gyms in Pokemon Go.  

It is a plugin for IITC to run in https://ingress.com/intel, you need an Ingress account and IITC already installed. You can use [this post](https://www.reddit.com/r/TheSilphRoad/comments/9fn61y/tutorial_pogo_s2_plugin_for_ingress_intel/) to learn how to install and configure it.

Features:
  1. You can draw two S2 cells levels
  2. It can cover the level 17 cells where there is already a pokestop or gym (currently you have to mark Gyms and Pokestops first), and if the L14 cell has already 3 gyms then it fills all of it with a dark color. In the center of the L14 cells will show the number of portals that must be added to that cell to get a new Gym.
  3. It can export the gyms and pokestops data as CSV to use it in any place where they expect that format (Overpass turbo, import to Google sheet for raid bots, ...)
  4. It can export the whole data as JSON to import it in another device.
  5. It shows a little analysis based on the S2 level of the first grid about the Pokestops and Gyms in each S2 cell.
  
In IITC there are two links added to the side pane, one shows the actions available with the Pokemon data and the other allows you to change the settings of the plugin.
 
The Actions dialog has several links that alow to export the current data, import from another device, show an analysis... Each button should have a tooltip.
   1. Reset data. In case something goes wrong (maybe incompatibility with another Pokemon Go plugin) test by clicking this option and reloading intel. If you have other IITC plugins for PoGo you should try to disable them if there are problems, this plugin includes everything that it's needed.  
   2. Import PoGo/ Export PoGo. to get data from one browser/computer to another.
   3. Find portal changes. It will scan the Ingress portals and check if any of them is missing in the PoGo data, or if PoGo data includes something that doesn't exist in Ingress.
   
Coloring of cells.  
When the Highlight cells that might get a Gym is selected, the L17 cells will be covered with a dark pattern, and L14 cells that have 3 gyms will be also darker so you can focus your efforts in other locations when requesting new portals.  
If a cell has enough portals but you have forgot to mark one of the stops as gyms the L14 cell will be marked as orange and in case that there are more gyms than expected then it will be red.
 
Adding Pokestops/Gyms  
When you select a portal, in the sidebar there will be two little icons of a pokeball and a gym so you can mark this portal as a Pokestop or Gym.
 
