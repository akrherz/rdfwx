<?php
require_once "../include/myview.php";
$t = new MyView();
$t->content = <<<EOM
<div class="row">
    <div class="col-md-6">Hello Maddy</div>
    <div class="col-md-6">Hello Maddy</div>
</div>
EOM;

$t->render('full.phtml');