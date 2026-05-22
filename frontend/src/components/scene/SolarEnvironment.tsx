import { getFogSettings } from "../../lib/scaleMode";

import StarfieldBackground from "./StarfieldBackground";



export default function SolarEnvironment() {

  const fog = getFogSettings();



  return (

    <>

      <StarfieldBackground />

      {fog.enabled && <fog attach="fog" args={["#030312", fog.near, fog.far]} />}
    </>

  );

}

