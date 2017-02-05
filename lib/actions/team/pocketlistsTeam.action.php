<?php

class pocketlistsTeamAction extends waViewAction
{
    public function execute()
    {
        // get all pocketlists users
        // all admin
        $teammates = array();
        $teammates_ids = pocketlistsRBAC::getAccessContacts();
        if ($teammates_ids) {
            $teammates = pocketlistsHelper::getTeammates($teammates_ids);

            $selected_teammate = waRequest::get('teammate');
            $lists = array();
            if ($selected_teammate) {
                $user_model = new waUserModel();
                $id = $user_model->getByLogin($selected_teammate);
                $id = $id['id'];

                $list_ids = pocketlistsRBAC::getAccessListForContact($id);
                $list_accessed = pocketlistsRBAC::getAccessListForContact();
                $list_ids = array_intersect($list_ids, $list_accessed);
                $lm = new pocketlistsListModel();
                $lists = $lm->filterArchive($lm->getById($list_ids));
            } else {
                $id = reset($teammates);
                $id = $id['id'];
            }
            $this->view->assign('lists', $lists);

            $im = new pocketlistsItemModel();
            $items = $im->getAssignedOrCompletesByContactItems($id);
            $this->view->assign('items', $im->getProperSort($im->extendItemData($items[0])));
            $this->view->assign('items_done', $im->extendItemData($items[1]));
            $this->view->assign('count_done_items', count($items[1]));
            $contact = new waContact($id);
            $this->view->assign('current_teammate', array(
                'name'      => $contact->getName(),
                'id'        => $contact->getId(),
                'photo_url' => $contact->getPhoto(),
                'login'     => $contact->get('login'),
            ));
        }

        $this->view->assign('teammates', $teammates);
        $this->view->assign('attachments_path', wa()->getDataUrl('attachments/', true));
        $this->view->assign('print', waRequest::get('print', false));
    }
}
