<?php

/**
 * Class pocketlistsListDetailsAction
 */
class pocketlistsListDetailsAction extends pocketlistsViewListAction
{
    /**
     * @throws waException
     */
    public function execute()
    {
        $this->view->assign('list', $this->getList());
    }
}
