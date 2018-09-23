server: points-5.data
	yarn watch

points-5.data: generate-points.js config.js
	node generate-points.js
