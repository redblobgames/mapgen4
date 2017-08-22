# Although the server doesn't really need _bundle.js I build it anyway
# so that the live version of the page doesn't diverge too much from
# the budo version

server: _bundle.js
	npm run start

_bundle.js: $(filter-out _bundle.js, $(wildcard *.js algorithms/*.js))
	npm run build
