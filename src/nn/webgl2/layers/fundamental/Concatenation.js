import Layer from '../../Layer'
import Tensor from '../../Tensor'
import * as tensorUtils from '../../utils/tensorUtils'
import webgl2 from '../../WebGL2'

 /**
 * Concatenation merge layer class, extends abstract _Merge class
 */
export default class Concatenation extends Layer {
  /**
   * Creates a Concatenation merge layer
   *
   * @param {Object} [attrs] - layer config attributes
   */
  constructor(attrs = {}) {
    super(attrs);
    this.name = 'Concatenation';
    // axis = -1 or 3 
    const { axis = -1 } = attrs;
    this.axis = axis;
  }

  /**
   * GPU call
   *
   * @param {Tensor[]} inputs
   */
  call(inputs) {
    // C axis is 3 in NHWC layout
    // no mini-batch axis here, so we subtract 1 if given axis > 0
    this.concatAxis = this.axis < 0 ? this.axis + inputs[0].originalShape.length: this.axis - 1;

    inputs.forEach(input => {
      if (!input.texture && !input.textureSlices) {
        input.createGLTexture({ type: '2d', format: 'float', supportSliceTexture: true });
      }
    })

    const outputTextureShape = inputs[0].textureShape.slice();
    // _concatAxis = 1 for 2D Texture
    let _concatAxis = 1;
    // create output textures if doesn't already exist
    outputTextureShape[_concatAxis] = inputs.map(input => input.textureShape[_concatAxis])
                                            .reduce((i, j) => i + j);
    if (!this.output) {
      this.output = new Tensor([], outputTextureShape);
      this.output.createGLTexture({ type: '2d', format: 'float', supportSliceTexture: true });
      if (inputs[0].is1D) {
        this.output.is1D = inputs[0].is1D;
      } else if (inputs[0].is2DReshaped) {
        this.output.is2DReshaped = inputs[0].is2DReshaped;
        this.output.originalShape = inputs[0].originalShape.slice();
        this.output.originalShape[this.concatAxis] = inputs.map(input => input.originalShape[this.concatAxis])
                                                           .reduce((i, j) => i + j);
        this.output.indicesForReshaped = tensorUtils.createIndicesFor2DReshaped(this.output.originalShape);
      }
    }

    const gl = webgl2.context;
    const textureOptions = webgl2.getTextureOptions(inputs[0].textureType, inputs[0].textureFormat);
    const { textureTarget, textureInternalFormat, textureFormat, textureType } = textureOptions;

    if (this.output.textureSlices) {
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      for (let i = 0; i < this.output.textureSlices.length; ++i) {
        gl.bindTexture(textureTarget, this.output.textureSlices[i]);
        inputs.forEach((input, k) => {
          gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, input.textureSlices[i], 0)
          gl.copyTexSubImage2D(
            textureTarget,
            0,
            k * input.textureSliceShape[1],
            0,
            0,
            0,
            input.textureSliceShape[1],
            input.textureSliceShape[0]
          )
        });
      }
      gl.deleteFramebuffer(framebuffer);
    } else {
      // console.log(`concate texture`)
      gl.bindTexture(textureTarget, this.output.texture);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      inputs.forEach((input, k) => {
        gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, input.texture, 0)
        gl.copyTexSubImage2D(
          textureTarget,
          0,
          k * input.textureShape[1],
          0,
          0,
          0,
          input.textureShape[1],
          input.textureShape[0]
        )
      });
      gl.deleteFramebuffer(framebuffer);
    }
    return this.output;
  }
}
