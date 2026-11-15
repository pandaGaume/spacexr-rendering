/// <reference lib="webworker" />
import { installDemDecoderWorker, type IDemWorkerScope } from "@spacexr/dem";
installDemDecoderWorker(self as unknown as IDemWorkerScope);
