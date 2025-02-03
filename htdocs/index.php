<?php
require_once "../include/myview.php";
$t = new MyView();
$t->content = <<<EOM

<p>Select Site:
<select id="site" class="form-control">
 <option value="BOOI4">Ames - AEA ISU-RDF</option>
 <option value="AMFI4">Ames - Finch Farm</option>
 <option value="AHDI4">Ames - Hinds Farm</option>
 <option value="AEEI4">Ames - Horticulture ISU-RDF</option>
 <option value="AHTI4">Ames - Horticulture (Vineyard)</option>
 <option value="AKCI4">Ames - Kitchen Farm</option>
 <option value="BNKI4">Bankston - Park Farm Winery (Vineyard)</option>
 <option value="CNAI4">Castana - Western ISU-RDF</option>
 <option value="CIRI4">Cedar Rapids</option>
 <option value="SBEI4">CFE - Ocheyedan</option>
 <option value="CHAI4">Chariton - McNay ISU-RDF</option>
 <option value="CRFI4">Crawfordsville - Southeast ISU-RDF</option>
 <option value="DONI4">Doon</option>
 <option value="FRUI4">Fruitland - Muscatine Island ISU-RDF</option>
 <option value="GVNI4">Glenwood - Blackwing Vineyard</option>
 <option value="GREI4">Greenfield - Neely Kinyon ISU-RDF</option>
 <option value="CSII4">Inwood - Calico Skies Winery</option>
 <option value="DOCI4">Jefferson - Deals Orchard</option>
 <option value="KNAI4">Kanawha</option>
 <option value="OKLI4">Lewis - Armstrong ISU-RDF</option>
 <option value="MCSI4">Marcus</option>
 <option value="TPOI4">Masonville - Timeless Prairie Orchard</option>
 <option value="NASI4">Nashua - Northeast ISU-RDF</option>
 <option value="NWLI4">Newell - Allee ISU-RDF</option>
 <option value="OSTI4">Oskaloosa - Tassel Ridge (Vineyard)</option>
 <option value="CAMI4">Sutherland - Northwest ISU-RDF</option>
 <option value="WMNI4">Wellman</option>
 <option value="WTPI4">West Point</option>
</select>
</p>

<div class="row">
  <div class="col-md-6">
    <div id="rain"></div>
  </div>
  <div class="col-md-6">
  <div id="airtemp"></div>
  </div>
</div>

EOM;
$t->jsextra = <<<EOM
<script src="index.js"></script>
EOM;

$t->render('full.phtml');