import { Vec3, mat4, vec2, vec3} from "wgpu-matrix";

const hilbert3D = ( 
  center: Vec3, 
  size = 10, 
  iterations = 1, 
  v0 = 0, 
  v1 = 1, 
  v2 = 2, 
  v3 = 3, 
  v4 = 4, 
  v5 = 5, 
  v6 = 6, 
  v7 = 7 
) => {

	// Default Vars
	const half = size / 2;

  const centerStartX = center[0] - half;
  const centerStartY = center[1] - half;
  const centerStartZ = center[2] - half;
  const centerEndX = center[0] + half;
  const centerEndY = center[1] + half;
  const centerEndZ = center[2] + half;

	const vec_s: Vec3[] = [
    [centerStartX, centerEndY,   centerStartZ],
    [centerStartX, centerEndY,   centerEndZ],
    [centerStartX, centerStartY, centerEndZ],
    [centerStartX, centerStartY, centerStartZ],
    [centerEndX,   centerStartY, centerStartZ],
    [centerEndX,   centerStartY, centerEndZ],
    [centerEndX,   centerEndY,   centerEndZ],
    [centerEndX,   centerEndY,   centerStartZ],
	];

	const vec = [
		vec_s[ v0 ],
		vec_s[ v1 ],
		vec_s[ v2 ],
		vec_s[ v3 ],
		vec_s[ v4 ],
		vec_s[ v5 ],
		vec_s[ v6 ],
		vec_s[ v7 ]
	];

	// Recurse iterations
	if ( -- iterations >= 0 ) {
		return [
			...hilbert3D( vec[ 0 ], half, iterations, v0, v3, v4, v7, v6, v5, v2, v1 ),
			...hilbert3D( vec[ 1 ], half, iterations, v0, v7, v6, v1, v2, v5, v4, v3 ),
			...hilbert3D( vec[ 2 ], half, iterations, v0, v7, v6, v1, v2, v5, v4, v3 ),
			...hilbert3D( vec[ 3 ], half, iterations, v2, v3, v0, v1, v6, v7, v4, v5 ),
			...hilbert3D( vec[ 4 ], half, iterations, v2, v3, v0, v1, v6, v7, v4, v5 ),
			...hilbert3D( vec[ 5 ], half, iterations, v4, v3, v2, v5, v6, v1, v0, v7 ),
			...hilbert3D( vec[ 6 ], half, iterations, v4, v3, v2, v5, v6, v1, v0, v7 ),
			...hilbert3D( vec[ 7 ], half, iterations, v6, v5, v2, v1, v0, v3, v4, v7 )
		];

	}
	// Return complete Hilbert Curve.
	return vec;
}


/**
 * Extensible curve object.
 *
 * Some common of curve methods:
 * .getPoint( t, optionalTarget ), .getTangent( t, optionalTarget )
 * .getPointAt( u, optionalTarget ), .getTangentAt( u, optionalTarget )
 * .getPoints(), .getSpacedPoints()
 * .getLength()
 * .updateArcLengths()
 *
 * This following curves inherit from THREE.Curve:
 *
 * -- 2D curves --
 * THREE.ArcCurve
 * THREE.CubicBezierCurve
 * THREE.EllipseCurve
 * THREE.LineCurve
 * THREE.QuadraticBezierCurve
 * THREE.SplineCurve
 *
 * -- 3D curves --
 * THREE.CatmullRomCurve3
 * THREE.CubicBezierCurve3
 * THREE.LineCurve3
 * THREE.QuadraticBezierCurve3
 *
 * A series of curves can be represented as a THREE.CurvePath.
 *
 **/

class Curve {
  type: string
  arcLengthDivisions: number;
  needsUpdate: boolean;
  cacheArcLengths: number[] | null;
	constructor() {
		this.type = 'Curve';
		this.arcLengthDivisions = 200;
    this.needsUpdate = false;
    this.cacheArcLengths = null;

	}

	// Virtual base class method to overwrite and implement in subclasses
	//	- t [0 .. 1]

	getPoint( t: number, optionalTarget?: any ) {

		console.warn( 'THREE.Curve: .getPoint() not implemented.' );
		return null;

	}

	// Get point at relative position in curve according to arc length
	// - u [0 .. 1]

	getPointAt( u: number, optionalTarget?: any ) {

		const t = this.getUtoTmapping( u );
		return this.getPoint( t, optionalTarget );

	}

	// Get sequence of points using getPoint( t )

	getPoints( divisions = 5 ) {

		const points = [];

		for ( let d = 0; d <= divisions; d ++ ) {

			points.push( this.getPoint( d / divisions ) );

		}

		return points;

	}

	// Get sequence of points using getPointAt( u )

	getSpacedPoints(divisions = 5) {

		const points = [];

		for ( let d = 0; d <= divisions; d ++ ) {

			points.push( this.getPointAt( d / divisions ) );

		}

		return points;

	}

	// Get total curve arc length

	getLength() {

		const lengths = this.getLengths();
		return lengths[ lengths.length - 1 ];

	}

	// Get list of cumulative segment lengths

	getLengths( divisions = this.arcLengthDivisions ) {

		if ( this.cacheArcLengths &&
			( this.cacheArcLengths.length === divisions + 1 ) &&
			! this.needsUpdate ) {

			return this.cacheArcLengths;

		}

		this.needsUpdate = false;

		const cache: number[] = [];
		let current, last = this.getPoint( 0 );
		let sum = 0;

		cache.push( 0 );

		for ( let p = 1; p <= divisions; p ++ ) {

			current = this.getPoint( p / divisions );
			sum += current.distanceTo( last );
			cache.push( sum );
			last = current;

		}

		this.cacheArcLengths = cache;

		return cache; // { sums: cache, sum: sum }; Sum is in the last element.

	}

	updateArcLengths() {

		this.needsUpdate = true;
		this.getLengths();

	}

	// Given u ( 0 .. 1 ), get a t to find p. This gives you points which are equidistant

	getUtoTmapping(u: number, distance?: number) {

		const arcLengths = this.getLengths();

		let i = 0;
		const il = arcLengths.length;

		let targetArcLength; // The targeted u distance value to get

		if ( distance ) {

			targetArcLength = distance;

		} else {

			targetArcLength = u * arcLengths[ il - 1 ];

		}

		// binary search for the index with largest value smaller than target u distance

		let low = 0, high = il - 1, comparison;

		while ( low <= high ) {

			i = Math.floor( low + ( high - low ) / 2 ); // less likely to overflow, though probably not issue here, JS doesn't really have integers, all numbers are floats

			comparison = arcLengths[ i ] - targetArcLength;

			if ( comparison < 0 ) {

				low = i + 1;

			} else if ( comparison > 0 ) {

				high = i - 1;

			} else {

				high = i;
				break;

				// DONE

			}

		}

		i = high;

		if ( arcLengths[ i ] === targetArcLength ) {

			return i / ( il - 1 );

		}

		// we could get finer grain at lengths, or use simple interpolation between two points

		const lengthBefore = arcLengths[ i ];
		const lengthAfter = arcLengths[ i + 1 ];

		const segmentLength = lengthAfter - lengthBefore;

		// determine where we are between the 'before' and 'after' points

		const segmentFraction = ( targetArcLength - lengthBefore ) / segmentLength;

		// add that fractional amount to t

		const t = ( i + segmentFraction ) / ( il - 1 );

		return t;

	}

	// Returns a unit vector tangent at t
	// In case any sub curve does not implement its tangent derivation,
	// 2 points a small delta apart will be used to find its gradient
	// which seems to give a reasonable approximation

	getTangent( t, optionalTarget ) {

		const delta = 0.0001;
		let t1 = t - delta;
		let t2 = t + delta;

		// Capping in case of danger

		if ( t1 < 0 ) t1 = 0;
		if ( t2 > 1 ) t2 = 1;

		const pt1 = this.getPoint( t1 );
		const pt2 = this.getPoint( t2 );

		const tangent = optionalTarget || ( ( pt1.isVector2 ) ? vec2.create() : vec3.create() );

		tangent.copy( pt2 ).sub( pt1 ).normalize();

		return tangent;

	}

	getTangentAt( u, optionalTarget ) {

		const t = this.getUtoTmapping( u );
		return this.getTangent( t, optionalTarget );

	}

	computeFrenetFrames( segments, closed ) {

		// see http://www.cs.indiana.edu/pub/techreports/TR425.pdf

		const normal = vec3.create();

		const tangents: Vec3[] = [];
		const normals: Vec3[] = [];
		const binormals: Vec3[] = [];

		const vec = vec3.create()
		const mat = mat4.create()

		// compute the tangent vectors for each segment on the curve

		for ( let i = 0; i <= segments; i ++ ) {

			const u = i / segments;

			tangents[ i ] = this.getTangentAt( u, vec3.create() );

		}

		// select an initial normal vector perpendicular to the first tangent vector,
		// and in the direction of the minimum tangent xyz component

		normals[ 0 ] = vec3.create()
		binormals[ 0 ] = vec3.create()
		let min = Number.MAX_VALUE;
		const tx = Math.abs( tangents[ 0 ].x );
		const ty = Math.abs( tangents[ 0 ].y );
		const tz = Math.abs( tangents[ 0 ].z );

		if ( tx <= min ) {

			min = tx;
			vec3.set(1, 0, 0, normal);

		}

		if ( ty <= min ) {

			min = ty;
      vec3.set(0, 1, 0, normal);

		}

		if ( tz <= min ) {
      vec3.set(0, 0, 1, normal);

		}

    vec3.copy(vec3.normalize(vec3.cross(tangents[0], normal)), vec);

    vec3.copy(vec3.cross(tangents[0], vec), normals[0]);
    vec3.copy(vec3.cross(tangents[0], normals[0]), binormals[0]);


		// compute the slowly-varying normal and binormal vectors for each segment on the curve

		for ( let i = 1; i <= segments; i ++ ) {
      vec3.copy(normals[i - 1], normals[i]);
      vec3.copy(binormals[i - 1], binormals[i]);

      vec3.copy(vec3.cross(tangents[i - 1], tangents[i]), vec);
			vec.crossVectors( tangents[ i - 1 ], tangents[ i ] );

			if ( vec.length() > Number.EPSILON ) {

				vec.normalize();

				const theta = Math.acos( MathUtils.clamp( tangents[ i - 1 ].dot( tangents[ i ] ), - 1, 1 ) ); // clamp for floating pt errors

				normals[ i ].applyMatrix4( mat.makeRotationAxis( vec, theta ) );

			}

			binormals[ i ].crossVectors( tangents[ i ], normals[ i ] );

		}

		// if the curve is closed, postprocess the vectors so the first and last normal vectors are the same

		if ( closed === true ) {

			let theta = Math.acos( MathUtils.clamp( normals[ 0 ].dot( normals[ segments ] ), - 1, 1 ) );
			theta /= segments;

			if ( tangents[ 0 ].dot( vec.crossVectors( normals[ 0 ], normals[ segments ] ) ) > 0 ) {

				theta = - theta;

			}

			for ( let i = 1; i <= segments; i ++ ) {

				// twist a little...
				normals[ i ].applyMatrix4( mat.makeRotationAxis( tangents[ i ], theta * i ) );
				binormals[ i ].crossVectors( tangents[ i ], normals[ i ] );

			}

		}

		return {
			tangents: tangents,
			normals: normals,
			binormals: binormals
		};

	}

	clone() {

		return new this.constructor().copy( this );

	}

	copy( source ) {

		this.arcLengthDivisions = source.arcLengthDivisions;

		return this;

	}

	toJSON() {

		const data = {
			metadata: {
				version: 4.6,
				type: 'Curve',
				generator: 'Curve.toJSON'
			}
		};

		data.arcLengthDivisions = this.arcLengthDivisions;
		data.type = this.type;

		return data;

	}

	fromJSON( json ) {

		this.arcLengthDivisions = json.arcLengthDivisions;

		return this;

	}

}


export { Curve };