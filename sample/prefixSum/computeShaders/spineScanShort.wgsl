enable subgroups;

// system
var<private> instanceIndex : u32;

struct Prefix_Sum_Reduction_0Struct {
	value : array< u32 >
};
@binding( 0 ) @group( 0 )
var<storage, read_write> Prefix_Sum_Reduction_0 : Prefix_Sum_Reduction_0Struct;

@compute @workgroup_size( 256, 1, 1 )
fn spineScanShort( @builtin( subgroup_invocation_id ) invocationSubgroupIndex : u32,
	@builtin( global_invocation_id ) globalId : vec3<u32>,
	@builtin( workgroup_id ) workgroupId : vec3<u32>,
	@builtin( local_invocation_id ) localId : vec3<u32>,
	@builtin( num_workgroups ) numWorkgroups : vec3<u32>,
	@builtin( subgroup_size ) subgroupSize : u32 ) {

	// system
	instanceIndex = globalId.x
		+ globalId.y * ( 256 * numWorkgroups.x )
		+ globalId.z * ( 256 * numWorkgroups.x ) * ( 1 * numWorkgroups.y );

	Prefix_Sum_Reduction_0.value[ invocationSubgroupIndex ] = subgroupInclusiveAdd( Prefix_Sum_Reduction_0.value[ invocationSubgroupIndex ] );

}
