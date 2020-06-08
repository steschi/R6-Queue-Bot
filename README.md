# Debate-Queue-Bot
Created to manage voice channel waiting rooms. This bot allows you to display the order of people waiting and easily pull them to another channel.  

## Setup
1. [Create your Discord bot account](https://discordpy.readthedocs.io/en/latest/discord.html)  
2. Clone/download this repository  
3. Create a database for storing queues. Here's a the steps for Windows:  
	3a. [Download Postgresql](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)  
	3b. Run the installer. Use the default port. Skip Stack Builder. Remember the password you set, you will need it later.  
	3c. Add Postgres to the Windows PATH:  
		Open Windows Start menu. Search for "Edit the system environment variables", click result.  
		Click the "Environment Variables" button on the bottom.  
		Under "System Variables", find "PATH", select it. Click "Edit".  
		On the right, click "New".  
		Enter "C:\Program Files\PostgreSQL\12\bin".  
		Hit "OK" on each window to save the changes.  
	3d. Open command prompt.  
	3e. Enter `psql -u postgres`  
	3f. Enter the password you chose during installation.   
	3g. Create a new database. (The semicolon is important):  
		`CREATE DATABASE myDatabase;`  
	3h. Close command prompt.  
4. Open the Queue Bot folder.  
5. Modify `config.json`:  
	If you followed all of Step 3, you only need to update the bolded fields in the table below.

| Parameter             | Description                                                                                                                       |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| **prefix**            | Command prefix (Default: `!`)                                                                                                     |
| **token**             | Bot token. Found in the Discord Developer Portal for the bot you created in Step 1. See image of token location below this table. |
| database_type         | Type of database for queue storage. (Default: `postgresql`)                                                                       |
| database_uri          | Database URI. (Example: `localhost:5432/myDatabase`)						       							                        |
| database_username     |                                                                                                                                   |
| **database_password** |                                                                                                                                   |
| grace_period          | Number of seconds a user can leave the queue without being removed                                                                |
| permissions_regexp    | What server roles can use bot commands. Uses RegExp. Accepts "mod" and "mods" by default.                                         |
| color                 | The color of bot messages.                                                                                                        |
| command_prefix_cmd    | Discord chat command to change the command prefix.                                                                                |
| color_cmd             | Discord chat command to change the color.                                                                                         |
| queue_cmd             | Discord chat command to change queues.                                                                                            |
| start_cmd             | Discord chat command to make the bot join a voice channel.                                                                        |
| display_cmd           | Discord chat command to display a queue in a text channel.                                                                        |
| grace_period_cmd      | Discord chat command to change the grace period.                                                                                  |
| help_cmd              | Discord chat command to display the help information.                                                                             |

![Token Location](docs/token_location.PNG)  

5. [Install NodeJS](https://discordjs.guide/preparations/#installing-node-js)  
6. Install Dependencies. Open commmand prompt in project directory (If you have the project open in file explorer, click on the directory bar and enter "cmd"). Enter `npm install` into command prompt. You can ignore the NPM warnings. Keep the command prompt open.
7. Start the Bot. Enter `node bot.js` into command prompt. If you get an error at boot, there is something wrong in your config.json. When you close command prompt, the bot will stop.  
8. **Optional**. Make the bot run in the background, so you don't need command prompt open.  
	8a. In command prompt (set to the project directory), enter `npm install forever`
	8b. To start the bot, enter `forever start bot.js`
	8c. To stop the bot, enter `forever stop bot.js`
  
## How to use
### Access  
All commands are restricted to owners or users with `mod` or `mods` in their server roles.  
### Commands  
`!q`  
Create or delete queues using `!q {channel name}`. Show current queues using `!q`.  
  
`!d`  
Display a queue in chat using `!d {channel name}`. Display messages stay updated.  
  
`!s`  
Add the bot to a voice channel using `!s {channel name}`. The bot can be pulled into a non-queue channel to automatically swap with person at the front of the queue. Right-click the bot to disconnect it from the voice channel when done. 

`!g`  
Change how long a person can leave a voice channel before being removed using `!g {time in seconds}`.

`!p`  
Change the command prefix using `!p {new prefix}`.  

`!c`  
Change the color using `!c {new color}`.  
