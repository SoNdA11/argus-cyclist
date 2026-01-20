export namespace domain {
	
	export class Activity {
	    id: number;
	    route_name: string;
	    filename: string;
	    total_distance: number;
	    total_elevation: number;
	    avg_power: number;
	    avg_speed: number;
	    duration: number;
	    calories: number;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Activity(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.route_name = source["route_name"];
	        this.filename = source["filename"];
	        this.total_distance = source["total_distance"];
	        this.total_elevation = source["total_elevation"];
	        this.avg_power = source["avg_power"];
	        this.avg_speed = source["avg_speed"];
	        this.duration = source["duration"];
	        this.calories = source["calories"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
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
	export class UserProfile {
	    id: number;
	    name: string;
	    weight: number;
	    bike_weight: number;
	    ftp: number;
	    max_hr: number;
	    theme: string;
	    units: string;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new UserProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.weight = source["weight"];
	        this.bike_weight = source["bike_weight"];
	        this.ftp = source["ftp"];
	        this.max_hr = source["max_hr"];
	        this.theme = source["theme"];
	        this.units = source["units"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class ExportPoint {
	    lat: number;
	    lon: number;
	    ele: number;
	
	    static createFrom(source: any = {}) {
	        return new ExportPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lat = source["lat"];
	        this.lon = source["lon"];
	        this.ele = source["ele"];
	    }
	}

}

export namespace storage {
	
	export class PowerRecord {
	    duration: number;
	    watts: number;
	    wkg: number;
	    // Go type: time
	    date: any;
	
	    static createFrom(source: any = {}) {
	        return new PowerRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.duration = source["duration"];
	        this.watts = source["watts"];
	        this.wkg = source["wkg"];
	        this.date = this.convertValues(source["date"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

