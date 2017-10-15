// Copyright (c) 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import React from 'react';
import { shallow } from 'enzyme';

import GraphTicks from './GraphTicks';
import Scrubber from './Scrubber';
import ViewingLayer, { dragTypes } from './ViewingLayer';
import { updateTypes } from '../../../utils/DraggableManager';
import { polyfill as polyfillAnimationFrame } from '../../../utils/test/requestAnimationFrame';

function getViewRange(viewStart, viewEnd) {
  return {
    time: {
      current: [viewStart, viewEnd],
    },
  };
}

describe('<SpanGraph>', () => {
  polyfillAnimationFrame(window);

  let props;
  let wrapper;

  beforeEach(() => {
    props = {
      height: 60,
      numTicks: 5,
      updateNextViewRangeTime: jest.fn(),
      updateViewRange: jest.fn(),
      viewRange: getViewRange(0, 1),
    };
    wrapper = shallow(<ViewingLayer {...props} />);
  });

  describe('_getDraggingBounds()', () => {
    beforeEach(() => {
      props = { ...props, viewRange: getViewRange(0.1, 0.9) };
      wrapper = shallow(<ViewingLayer {...props} />);
      wrapper.instance()._setRoot({
        getBoundingClientRect() {
          return { left: 10, width: 100 };
        },
      });
    });

    it('throws if _root is not set', () => {
      const instance = wrapper.instance();
      instance._root = null;
      expect(() => instance._getDraggingBounds(dragTypes.REFRAME)).toThrow();
    });

    it('returns the correct bounds for reframe', () => {
      const bounds = wrapper.instance()._getDraggingBounds(dragTypes.REFRAME);
      expect(bounds).toEqual({
        clientXLeft: 10,
        width: 100,
        maxValue: 1,
        minValue: 0,
      });
    });

    it('returns the correct bounds for shiftStart', () => {
      const bounds = wrapper.instance()._getDraggingBounds(dragTypes.SHIFT_START);
      expect(bounds).toEqual({
        clientXLeft: 10,
        width: 100,
        maxValue: 0.9,
        minValue: 0,
      });
    });

    it('returns the correct bounds for shiftEnd', () => {
      const bounds = wrapper.instance()._getDraggingBounds(dragTypes.SHIFT_END);
      expect(bounds).toEqual({
        clientXLeft: 10,
        width: 100,
        maxValue: 1,
        minValue: 0.1,
      });
    });
  });

  describe('DraggableManager callbacks', () => {
    describe('reframe', () => {
      it('handles mousemove', () => {
        const value = 0.5;
        wrapper.instance()._handleReframeMouseMove({ value });
        const calls = props.updateNextViewRangeTime.mock.calls;
        expect(calls).toEqual([[{ cursor: value }]]);
      });

      it('handles mouseleave', () => {
        wrapper.instance()._handleReframeMouseLeave();
        const calls = props.updateNextViewRangeTime.mock.calls;
        expect(calls).toEqual([[{ cursor: null }]]);
      });

      describe('drag update', () => {
        it('handles sans anchor', () => {
          const value = 0.5;
          wrapper.instance()._handleReframeDragUpdate({ value });
          const calls = props.updateNextViewRangeTime.mock.calls;
          expect(calls).toEqual([[{ reframe: { anchor: value, shift: value } }]]);
        });

        it('handles the existing anchor', () => {
          const value = 0.5;
          const anchor = 0.1;
          const time = { ...props.viewRange.time, reframe: { anchor } };
          props = { ...props, viewRange: { time } };
          wrapper = shallow(<ViewingLayer {...props} />);
          wrapper.instance()._handleReframeDragUpdate({ value });
          const calls = props.updateNextViewRangeTime.mock.calls;
          expect(calls).toEqual([[{ reframe: { anchor, shift: value } }]]);
        });
      });

      describe('drag end', () => {
        let manager;

        beforeEach(() => {
          manager = { resetBounds: jest.fn() };
        });

        it('handles sans anchor', () => {
          const value = 0.5;
          wrapper.instance()._handleReframeDragEnd({ manager, value });
          expect(manager.resetBounds.mock.calls).toEqual([[]]);
          const calls = props.updateViewRange.mock.calls;
          expect(calls).toEqual([[value, value]]);
        });

        it('handles dragged left (anchor is greater)', () => {
          const value = 0.5;
          const anchor = 0.6;
          const time = { ...props.viewRange.time, reframe: { anchor } };
          props = { ...props, viewRange: { time } };
          wrapper = shallow(<ViewingLayer {...props} />);
          wrapper.instance()._handleReframeDragEnd({ manager, value });

          expect(manager.resetBounds.mock.calls).toEqual([[]]);
          const calls = props.updateViewRange.mock.calls;
          expect(calls).toEqual([[value, anchor]]);
        });

        it('handles dragged right (anchor is less)', () => {
          const value = 0.5;
          const anchor = 0.4;
          const time = { ...props.viewRange.time, reframe: { anchor } };
          props = { ...props, viewRange: { time } };
          wrapper = shallow(<ViewingLayer {...props} />);
          wrapper.instance()._handleReframeDragEnd({ manager, value });

          expect(manager.resetBounds.mock.calls).toEqual([[]]);
          const calls = props.updateViewRange.mock.calls;
          expect(calls).toEqual([[anchor, value]]);
        });
      });
    });

    describe('scrubber', () => {
      it('prevents the cursor from being drawn on scrubber mouseover', () => {
        wrapper.instance()._handleScrubberEnterLeave({ type: updateTypes.MOUSE_ENTER });
        expect(wrapper.state('preventCursorLine')).toBe(true);
      });

      it('prevents the cursor from being drawn on scrubber mouseleave', () => {
        wrapper.instance()._handleScrubberEnterLeave({ type: updateTypes.MOUSE_LEAVE });
        expect(wrapper.state('preventCursorLine')).toBe(false);
      });

      describe('drag start and update', () => {
        it('stops propagation on drag start', () => {
          const stopPropagation = jest.fn();
          const update = {
            event: { stopPropagation },
            type: updateTypes.DRAG_START,
          };
          wrapper.instance()._handleScrubberDragUpdate(update);
          expect(stopPropagation.mock.calls).toEqual([[]]);
        });

        it('updates the viewRange for shiftStart and shiftEnd', () => {
          const instance = wrapper.instance();
          const value = 0.5;
          const cases = [
            {
              dragUpdate: {
                value,
                tag: dragTypes.SHIFT_START,
                type: updateTypes.DRAG_MOVE,
              },
              viewRangeUpdate: { shiftStart: value },
            },
            {
              dragUpdate: {
                value,
                tag: dragTypes.SHIFT_END,
                type: updateTypes.DRAG_MOVE,
              },
              viewRangeUpdate: { shiftEnd: value },
            },
          ];
          cases.forEach(_case => {
            instance._handleScrubberDragUpdate(_case.dragUpdate);
            expect(props.updateNextViewRangeTime).lastCalledWith(_case.viewRangeUpdate);
          });
        });
      });

      it('updates the view on drag end', () => {
        const instance = wrapper.instance();
        const [viewStart, viewEnd] = props.viewRange.time.current;
        const value = 0.5;
        const cases = [
          {
            dragUpdate: {
              value,
              manager: { resetBounds: jest.fn() },
              tag: dragTypes.SHIFT_START,
            },
            viewRangeUpdate: [value, viewEnd],
          },
          {
            dragUpdate: {
              value,
              manager: { resetBounds: jest.fn() },
              tag: dragTypes.SHIFT_END,
            },
            viewRangeUpdate: [viewStart, value],
          },
        ];
        cases.forEach(_case => {
          const { manager } = _case.dragUpdate;
          wrapper.setState({ preventCursorLine: true });
          expect(wrapper.state('preventCursorLine')).toBe(true);
          instance._handleScrubberDragEnd(_case.dragUpdate);
          expect(wrapper.state('preventCursorLine')).toBe(false);
          expect(manager.resetBounds.mock.calls).toEqual([[]]);
          expect(props.updateViewRange).lastCalledWith(..._case.viewRangeUpdate);
        });
      });
    });
  });

  it('renders a <GraphTicks />', () => {
    expect(wrapper.find(GraphTicks).length).toBe(1);
  });

  it('renders a filtering box if leftBound exists', () => {
    const _props = { ...props, viewRange: getViewRange(0.2, 1) };
    wrapper = shallow(<ViewingLayer {..._props} />);

    const leftBox = wrapper.find('.ViewingLayer--inactive');
    expect(leftBox.length).toBe(1);
    const width = Number(leftBox.prop('width').slice(0, -1));
    const x = leftBox.prop('x');
    expect(Math.round(width)).toBe(20);
    expect(x).toBe(0);
  });

  it('renders a filtering box if rightBound exists', () => {
    const _props = { ...props, viewRange: getViewRange(0, 0.8) };
    wrapper = shallow(<ViewingLayer {..._props} />);

    const rightBox = wrapper.find('.ViewingLayer--inactive');
    expect(rightBox.length).toBe(1);
    const width = Number(rightBox.prop('width').slice(0, -1));
    const x = Number(rightBox.prop('x').slice(0, -1));
    expect(Math.round(width)).toBe(20);
    expect(x).toBe(80);
  });

  it('renders handles for the timeRangeFilter', () => {
    const [viewStart, viewEnd] = props.viewRange.time.current;
    let scrubber = <Scrubber position={viewStart} />;
    expect(wrapper.containsMatchingElement(scrubber)).toBeTruthy();
    scrubber = <Scrubber position={viewEnd} />;
    expect(wrapper.containsMatchingElement(scrubber)).toBeTruthy();
  });
});