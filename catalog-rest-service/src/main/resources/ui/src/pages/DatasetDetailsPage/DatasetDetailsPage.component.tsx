/*
  * Licensed to the Apache Software Foundation (ASF) under one or more
  * contributor license agreements. See the NOTICE file distributed with
  * this work for additional information regarding copyright ownership.
  * The ASF licenses this file to You under the Apache License, Version 2.0
  * (the "License"); you may not use this file except in compliance with
  * the License. You may obtain a copy of the License at

  * http://www.apache.org/licenses/LICENSE-2.0

  * Unless required by applicable law or agreed to in writing, software
  * distributed under the License is distributed on an "AS IS" BASIS,
  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  * See the License for the specific language governing permissions and
  * limitations under the License.
*/

import { AxiosResponse } from 'axios';
import { compare } from 'fast-json-patch';
import { observer } from 'mobx-react';
import { EntityTags } from 'Models';
import React, { FunctionComponent, useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import AppState from '../../AppState';
import { getDatabase } from '../../axiosAPIs/databaseAPI';
import { getLineageByFQN } from '../../axiosAPIs/lineageAPI';
import { getServiceById } from '../../axiosAPIs/serviceAPI';
import {
  addFollower,
  getTableDetailsByFQN,
  patchTableDetails,
  removeFollower,
} from '../../axiosAPIs/tableAPI';
import { TitleBreadcrumbProps } from '../../components/common/title-breadcrumb/title-breadcrumb.interface';
import DatasetDetails from '../../components/DatasetDetails/DatasetDetails.component';
import Loader from '../../components/Loader/Loader';
import {
  getDatabaseDetailsPath,
  getDatasetVersionPath,
  getServiceDetailsPath,
} from '../../constants/constants';
import { EntityType } from '../../enums/entity.enum';
import {
  Table,
  TableData,
  TableJoins,
  TypeUsedToReturnUsageDetailsOfAnEntity,
} from '../../generated/entity/data/table';
import { User } from '../../generated/entity/teams/user';
import { EntityLineage } from '../../generated/type/entityLineage';
import {
  addToRecentViewed,
  getCurrentUserId,
  getPartialNameFromFQN,
} from '../../utils/CommonUtils';
import { serviceTypeLogo } from '../../utils/ServiceUtils';
import { getOwnerFromId, getTierFromTableTags } from '../../utils/TableUtils';
import { getTableTags } from '../../utils/TagsUtils';

const DatasetDetailsPage: FunctionComponent = () => {
  const history = useHistory();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const USERId = getCurrentUserId();
  const [tableId, setTableId] = useState('');
  const [tier, setTier] = useState<string>();
  const [name, setName] = useState('');
  const [followers, setFollowers] = useState<Array<User>>([]);
  const [slashedTableName, setSlashedTableName] = useState<
    TitleBreadcrumbProps['titleLinks']
  >([]);
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<Table['columns']>([]);
  const [sampleData, setSampleData] = useState<TableData>({
    columns: [],
    rows: [],
  });
  const [tableTags, setTableTags] = useState<Array<EntityTags>>([]);
  const [owner, setOwner] = useState<
    Table['owner'] & { displayName?: string }
  >();
  const [joins, setJoins] = useState<TableJoins>({
    startDate: new Date(),
    dayCount: 0,
    columnJoins: [],
  });
  const [tableProfile, setTableProfile] = useState<Table['tableProfile']>([]);
  const [tableDetails, setTableDetails] = useState<Table>({} as Table);
  const [activeTab, setActiveTab] = useState<number>(1);
  const { datasetFQN: tableFQN } = useParams() as Record<string, string>;
  const [entityLineage, setEntityLineage] = useState<EntityLineage>(
    {} as EntityLineage
  );
  const [usageSummary, setUsageSummary] =
    useState<TypeUsedToReturnUsageDetailsOfAnEntity>(
      {} as TypeUsedToReturnUsageDetailsOfAnEntity
    );
  const [currentVersion, setCurrentVersion] = useState<string>();
  const [previousVersion, setPreviousVersion] = useState<string>();

  const activeTabHandler = (tabValue: number) => {
    setActiveTab(tabValue);
  };

  const saveUpdatedTableData = (updatedData: Table): Promise<AxiosResponse> => {
    const jsonPatch = compare(tableDetails, updatedData);

    return patchTableDetails(
      tableId,
      jsonPatch
    ) as unknown as Promise<AxiosResponse>;
  };

  const descriptionUpdateHandler = (updatedTable: Table) => {
    saveUpdatedTableData(updatedTable).then((res: AxiosResponse) => {
      const { description, version, changeDescription } = res.data;
      setCurrentVersion(version);
      setPreviousVersion(changeDescription.previousVersion);
      setTableDetails(res.data);
      setDescription(description);
    });
  };

  const columnsUpdateHandler = (updatedTable: Table) => {
    saveUpdatedTableData(updatedTable).then((res: AxiosResponse) => {
      const { columns, version, changeDescription } = res.data;
      setCurrentVersion(version);
      setPreviousVersion(changeDescription.previousVersion);
      setTableDetails(res.data);
      setColumns(columns);
      setTableTags(getTableTags(columns || []));
    });
  };

  const settingsUpdateHandler = (updatedTable: Table): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      saveUpdatedTableData(updatedTable)
        .then((res) => {
          const { version, changeDescription, owner, tags } = res.data;
          setCurrentVersion(version);
          setPreviousVersion(changeDescription.previousVersion);
          setTableDetails(res.data);
          setOwner(getOwnerFromId(owner?.id));
          setTier(getTierFromTableTags(tags));
          resolve();
        })
        .catch(() => reject());
    });
  };

  const followTable = () => {
    addFollower(tableId, USERId).then((res: AxiosResponse) => {
      const { followers } = res.data;
      setFollowers(followers);
    });
  };
  const unfollowTable = () => {
    removeFollower(tableId, USERId).then((res: AxiosResponse) => {
      const { followers } = res.data;

      setFollowers(followers);
    });
  };

  const versionHandler = () => {
    if (previousVersion) {
      history.push(getDatasetVersionPath(tableFQN, previousVersion as string));
    }
  };

  useEffect(() => {
    setIsLoading(true);
    getTableDetailsByFQN(
      getPartialNameFromFQN(tableFQN, ['service', 'database', 'table'], '.'),
      'columns, database, usageSummary, followers, joins, tags, owner, sampleData, tableProfile'
    )
      .then((res: AxiosResponse) => {
        const {
          description,
          id,
          name,
          columns,
          database,
          owner,
          usageSummary,
          followers,
          fullyQualifiedName,
          joins,
          tags,
          sampleData,
          tableProfile,
          version,
          changeDescription,
        } = res.data;
        setTableDetails(res.data);
        setTableId(id);
        setCurrentVersion(version);
        setPreviousVersion(changeDescription?.previousVersion);
        setTier(getTierFromTableTags(tags));
        setOwner(getOwnerFromId(owner?.id));
        setFollowers(followers);
        getDatabase(database.id, 'service').then((resDB: AxiosResponse) => {
          getServiceById('databaseServices', resDB.data.service?.id).then(
            (resService: AxiosResponse) => {
              setSlashedTableName([
                {
                  name: resService.data.name,
                  url: resService.data.name
                    ? getServiceDetailsPath(
                        resService.data.name,
                        resService.data.serviceType
                      )
                    : '',
                  imgSrc: resService.data.serviceType
                    ? serviceTypeLogo(resService.data.serviceType)
                    : undefined,
                },
                {
                  name: resDB.data.name,
                  url: getDatabaseDetailsPath(resDB.data.fullyQualifiedName),
                },
                {
                  name: name,
                  url: '',
                  activeTitle: true,
                },
              ]);

              addToRecentViewed({
                entityType: EntityType.DATASET,
                fqn: fullyQualifiedName,
                serviceType: resService.data.serviceType,
                timestamp: 0,
              });
            }
          );
        });
        setName(name);

        setDescription(description);
        setColumns(columns || []);
        setSampleData(sampleData);
        setTableProfile(tableProfile || []);
        setTableTags(getTableTags(columns || []));
        setUsageSummary(usageSummary);
        setJoins(joins);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });

    setActiveTab(1);
    getLineageByFQN(tableFQN, EntityType.TABLE).then((res: AxiosResponse) =>
      setEntityLineage(res.data)
    );
  }, [tableFQN]);

  return (
    <>
      {isLoading ? (
        <Loader />
      ) : (
        <DatasetDetails
          activeTab={activeTab}
          columns={columns}
          columnsUpdateHandler={columnsUpdateHandler}
          datasetFQN={tableFQN}
          description={description}
          descriptionUpdateHandler={descriptionUpdateHandler}
          entityLineage={entityLineage}
          entityName={name}
          followers={followers}
          followTableHandler={followTable}
          joins={joins}
          owner={owner as Table['owner'] & { displayName: string }}
          sampleData={sampleData}
          setActiveTabHandler={activeTabHandler}
          settingsUpdateHandler={settingsUpdateHandler}
          slashedTableName={slashedTableName}
          tableDetails={tableDetails}
          tableProfile={tableProfile}
          tableTags={tableTags}
          tier={tier as string}
          unfollowTableHandler={unfollowTable}
          usageSummary={usageSummary}
          users={AppState.users}
          version={currentVersion}
          versionHandler={versionHandler}
        />
      )}
    </>
  );
};

export default observer(DatasetDetailsPage);
