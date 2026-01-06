export namespace domain {
	
	export class RoutePoint {
	    lat: number;
	    lon: number;
	    elevation: number;
	    distance: number;
	    grade: number;
	
	    static createFrom(source: any = {}) {
	        return new RoutePoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lat = source["lat"];
	        this.lon = source["lon"];
	        this.elevation = source["elevation"];
	        this.distance = source["distance"];
	        this.grade = source["grade"];
	    }
	}

}

