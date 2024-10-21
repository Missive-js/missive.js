#!/bin/bash

WORKDING_DIRS="libs/missive.js/src examples/shared/src"

for WORKDING_DIR in ${WORKDING_DIRS}; do
    cd ${WORKDING_DIR}
    echo "Doing ${WORKDING_DIR}"
    echo "// generated" > index.ts
    for TS_FILE_PATH in `find . -name \*.ts | grep -v *.d.ts`; do 
        if [ "${TS_FILE_PATH}" == "./index.ts" ]; then
            continue
        fi
        echo "- ${TS_FILE_PATH}"
        echo "export * from '${TS_FILE_PATH//.ts/.js}';" >> index.ts
    done
    for TSX_FILE_PATH in `find . -name \*.tsx`; do 
        echo "- ${TSX_FILE_PATH}"
        echo "export * from '${TSX_FILE_PATH//.tsx/.jsx}';" >> index.ts
    done
    cd -
done

