declare module 'camera-core' {
	export {
		getVideoConstraintsByQuality,
		startCamera,
		startCameraAndMicrophone,
		startMicrophone,
		stopMediaStream,
		type CameraState,
		type VideoQuality
	} from '../../../packages/camera-core/src/index';
}
