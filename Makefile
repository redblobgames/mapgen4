page: build/points-5.data
	yarn watch

build/points-5.data: generate-points.js config.js
	mkdir -p build
	node generate-points.js
