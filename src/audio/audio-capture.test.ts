import { AudioCapture } from "./audio-capture";

describe("AudioCapture.evaluateDeviceChange", () => {
  it("does not restart on the first reading", () => {
    expect(AudioCapture.evaluateDeviceChange("", "{endpoint-speakers}")).toEqual({
      restart: false,
      nextDevice: "{endpoint-speakers}",
    });
  });

  it("restarts when the device changes", () => {
    expect(
      AudioCapture.evaluateDeviceChange("{endpoint-speakers}", "{endpoint-headphones}"),
    ).toEqual({ restart: true, nextDevice: "{endpoint-headphones}" });
  });

  it("does not restart when the device is unchanged", () => {
    expect(
      AudioCapture.evaluateDeviceChange("{endpoint-speakers}", "{endpoint-speakers}"),
    ).toEqual({ restart: false, nextDevice: "{endpoint-speakers}" });
  });

  it("ignores an empty reading and keeps the previous device", () => {
    expect(AudioCapture.evaluateDeviceChange("{endpoint-speakers}", "")).toEqual({
      restart: false,
      nextDevice: "{endpoint-speakers}",
    });
  });

  it("stays put when there is no known device and no reading", () => {
    expect(AudioCapture.evaluateDeviceChange("", "")).toEqual({
      restart: false,
      nextDevice: "",
    });
  });
});
